"""Interview sessions: create → brief → turns → end → report.

The database is the source of truth for the transcript and the interview state machine.
Pattern for every AI endpoint: read what we need, release the DB connection, stream the
model's output, then open a fresh DB session to save the result. No connection is held
open while the model is thinking.
"""

import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Response, status
from sqlalchemy.exc import IntegrityError

from app import llm, mock, repo, resume_profile
from app.config import get_settings
from app.db import get_sessionmaker
from app.deps import AIUser, CurrentUser, Db, ensure_ai_quota
from app.errors import AppError
from app.interview import apply_reply, closes_too_early, plan_for
from app.llm import AIError, StreamEvent, TextDelta
from app.prompts.brief import Brief, brief_prompt
from app.prompts.hint import hint_prompt
from app.prompts.interviewer import InterviewerReply, interviewer_system, interviewer_user
from app.prompts.report import Report, report_prompt
from app.schemas import ReportRequest, SessionOut, Setup, TurnIn, TurnRequest
from app.sse import event, partial_json_string
from app.streaming import Tally, progress, save_usage, sse_response, structured

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

SYSTEM_COACH = "You are Curveball, an expert interview coach. Follow the output format exactly."
EARLY_END = "Let's stop here. Thanks for your time."


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(setup: Setup, db: Db, user: CurrentUser, background: BackgroundTasks) -> SessionOut:
    s = await repo.create_session(db, user, setup)
    # Read the resume now, so its profile is usually ready before any prompt needs it.
    background.add_task(resume_profile.ensure_profile, s.id, user.id)
    return SessionOut.model_validate(repo.to_out(s))


@router.get("/{session_id}")
async def get(session_id: uuid.UUID, db: Db, user: CurrentUser) -> SessionOut:
    return SessionOut.model_validate(repo.to_out(await repo.get_owned_session(db, user.id, session_id)))


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(session_id: uuid.UUID, db: Db, user: CurrentUser) -> Response:
    await repo.delete_session(db, user, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{session_id}/brief")
async def brief(session_id: uuid.UUID, db: Db, user: CurrentUser) -> Any:
    s = await repo.get_owned_session(db, user.id, session_id)
    if s.brief:  # already built: idempotent, and free
        return sse_response(_once(event("result", s.brief.content)))
    await ensure_ai_quota(db, user)
    setup, user_id = repo.setup_of(s), user.id
    settings = get_settings()
    profile: str | None = None

    def make(_attempt: int) -> AsyncIterator[StreamEvent]:
        if settings.ai_mock:
            return mock.mock_brief(setup)
        prompt = brief_prompt(setup, profile)
        return llm.stream("balanced", SYSTEM_COACH, prompt, settings.max_tokens_brief, schema=Brief)

    async def gen() -> AsyncIterator[str]:
        nonlocal profile
        tally = Tally()
        try:
            if setup.resume.strip():
                yield event("stage", {"stage": "resume"})
                profile = resume_profile.as_text(await resume_profile.ensure_profile(session_id, user_id))
            yield event("stage", {"stage": "writing"})
            async for item in structured(make, Brief, progress, tally):
                if isinstance(item, Brief):
                    content = item.model_dump()
                    async with get_sessionmaker()() as db2:
                        s2 = await repo.get_owned_session(db2, user_id, session_id)
                        if not s2.brief:
                            repo.save_brief(s2, content)
                            await db2.commit()
                    yield event("result", content)
                else:
                    yield item
        finally:
            await save_usage(user_id, tally)

    return sse_response(gen())


@router.post("/{session_id}/turn")
async def turn(session_id: uuid.UUID, body: TurnIn, db: Db, user: AIUser) -> Any:
    """Save the candidate's answer (if any), then stream the interviewer's next turn."""
    s = await repo.get_owned_session(db, user.id, session_id)
    if s.status == "done":
        raise AppError(409, "interview_over")
    last = s.turns[-1] if s.turns else None
    answer = (body.answer or "").strip()
    if last is not None and last.speaker == "interviewer":
        if not answer:
            raise AppError(409, "awaiting_answer")
        repo.add_turn(db, s, "candidate", answer, answer_seconds=body.answer_seconds)
    # else: first turn, or a retry after the answer was already saved; any answer sent is a duplicate.
    if s.status in ("setup", "brief"):
        s.status = "live"
    await db.commit()

    req = TurnRequest(
        setup=repo.setup_of(s),
        interviewer=s.interviewer,
        transcript=repo.transcript_of(s),
        state=repo.state_of(s),
    )
    user_id = user.id
    settings = get_settings()
    # Turns never wait for the resume profile: use it if it's ready, else the raw resume.
    system = interviewer_system(req.setup, req.interviewer, resume_profile.as_text(s.resume_profile))

    def make(attempt: int) -> AsyncIterator[StreamEvent]:
        if settings.ai_mock:
            return mock.mock_turn(req)
        plan = plan_for(req) + (" Follow this instruction exactly." if attempt else "")
        return llm.stream(
            "fast",
            system,
            interviewer_user(req, plan),
            settings.max_tokens_turn,
            InterviewerReply,
            cache_system=True,
        )

    def on_text(buffer: str) -> str | None:
        say = partial_json_string(buffer, "say")
        return event("say", {"text": say}) if say else None

    async def gen() -> AsyncIterator[str]:
        tally = Tally()
        try:
            async for item in structured(
                make, InterviewerReply, on_text, tally, check=lambda r: not closes_too_early(r.kind, req)
            ):
                if not isinstance(item, InterviewerReply):
                    yield item
                    continue
                applied = apply_reply(item.kind, item.say, req)
                async with get_sessionmaker()() as db2:
                    s2 = await repo.get_owned_session(db2, user_id, session_id)
                    if len(s2.turns) != len(req.transcript):
                        raise AIError("upstream", "transcript changed during the turn")
                    repo.add_turn(db2, s2, "interviewer", applied.say, kind=applied.kind)
                    s2.main_asked = applied.state.main_asked
                    s2.followup_used = applied.state.followup_used
                    if applied.state.done:
                        s2.status = "done"
                    try:
                        await db2.commit()
                    except IntegrityError as e:  # a parallel request saved this turn first
                        raise AIError("upstream", "duplicate turn") from e
                yield event(
                    "result", {"kind": applied.kind, "say": applied.say, "state": applied.state.model_dump()}
                )
        finally:
            await save_usage(user_id, tally)

    return sse_response(gen())


@router.post("/{session_id}/hint")
async def hint(session_id: uuid.UUID, db: Db, user: AIUser) -> Any:
    s = await repo.get_owned_session(db, user.id, session_id)
    question = next((t.text for t in reversed(s.turns) if t.speaker == "interviewer"), None)
    if question is None or s.status == "done":
        raise AppError(409, "no_question")
    setup, user_id = repo.setup_of(s), user.id
    profile = resume_profile.as_text(s.resume_profile)
    settings = get_settings()

    async def gen() -> AsyncIterator[str]:
        tally = Tally()
        prompt = hint_prompt(setup, question, profile)
        source = (
            mock.mock_hint()
            if settings.ai_mock
            else llm.stream("fast", SYSTEM_COACH, prompt, settings.max_tokens_hint)
        )
        try:
            async for ev in source:
                if isinstance(ev, TextDelta):
                    yield event("delta", {"text": ev.text})
                else:
                    tally.add(ev)
                    yield event("result", {"text": ev.text.strip()})
        finally:
            await save_usage(user_id, tally)

    return sse_response(gen())


@router.post("/{session_id}/end")
async def end(session_id: uuid.UUID, db: Db, user: CurrentUser) -> SessionOut:
    """End early. The page, not the model, decides when the interview is over."""
    s = await repo.get_owned_session(db, user.id, session_id)
    if s.status != "done":
        if not any(t.speaker == "candidate" for t in s.turns):
            raise AppError(422, "nothing_to_score")
        repo.add_turn(db, s, "interviewer", EARLY_END, kind="closing")
        s.status = "done"
        await db.commit()
    return SessionOut.model_validate(repo.to_out(s))


@router.post("/{session_id}/report")
async def report(session_id: uuid.UUID, db: Db, user: CurrentUser) -> Any:
    s = await repo.get_owned_session(db, user.id, session_id)
    if s.report:  # already scored: idempotent, and free
        return sse_response(_once(event("result", s.report.content)))
    if s.status != "done":
        raise AppError(409, "interview_not_finished")
    if not any(t.speaker == "candidate" for t in s.turns):
        raise AppError(422, "nothing_to_score")
    await ensure_ai_quota(db, user)
    req = ReportRequest(setup=repo.setup_of(s), interviewer=s.interviewer, transcript=repo.transcript_of(s))
    user_id = user.id
    settings = get_settings()
    profile: str | None = None

    def make(_attempt: int) -> AsyncIterator[StreamEvent]:
        if settings.ai_mock:
            return mock.mock_report(req.transcript)
        prompt = report_prompt(req, profile)
        return llm.stream("capable", SYSTEM_COACH, prompt, settings.max_tokens_report, schema=Report)

    async def gen() -> AsyncIterator[str]:
        nonlocal profile
        tally = Tally()
        try:
            if req.setup.resume.strip():
                yield event("stage", {"stage": "resume"})
                profile = resume_profile.as_text(await resume_profile.ensure_profile(session_id, user_id))
            yield event("stage", {"stage": "scoring"})
            async for item in structured(make, Report, progress, tally):
                if isinstance(item, Report):
                    content = item.model_dump(by_alias=True)
                    async with get_sessionmaker()() as db2:
                        s2 = await repo.get_owned_session(db2, user_id, session_id)
                        if not s2.report:
                            repo.save_report(s2, content)
                            await db2.commit()
                    yield event("result", content)
                else:
                    yield item
        finally:
            await save_usage(user_id, tally)

    return sse_response(gen())


async def _once(chunk: str) -> AsyncIterator[str]:
    yield chunk

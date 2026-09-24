"""HTTP API. AI endpoints stream Server-Sent Events:

progress {chars}      structured calls: how much has been written so far
say {text}            interviewer turn: the words so far
delta {text}          hint: next chunk of text
reset {}              a retry started; discard what was streamed
result {...}          the validated final payload
error {code, retryable}
"""

import logging
from collections.abc import AsyncIterator, Callable

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app import llm, mock
from app.config import get_settings
from app.interview import apply_reply, closes_too_early, plan_for
from app.llm import AIError, Finished, StreamEvent, TextDelta
from app.prompts.brief import Brief, brief_prompt
from app.prompts.hint import hint_prompt
from app.prompts.interviewer import InterviewerReply, interviewer_system, interviewer_user
from app.prompts.report import Report, report_prompt
from app.resume import ResumeParseError, extract_text
from app.schemas import HintRequest, ReportRequest, Setup, TurnRequest
from app.sse import event, partial_json_string

log = logging.getLogger("mockroom.api")
router = APIRouter(prefix="/api")

SYSTEM_COACH = "You are Mock Room, an expert interview coach. Follow the output format exactly."


def _sse(gen: AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _guard(gen: AsyncIterator[str]) -> AsyncIterator[str]:
    """Turn any failure into an `error` event; never leak raw errors to the browser."""
    try:
        async for chunk in gen:
            yield chunk
    except AIError as e:
        yield event("error", {"code": e.code, "retryable": e.retryable})
    except Exception:
        log.exception("unexpected error while streaming")
        yield event("error", {"code": "upstream", "retryable": True})


async def _structured[M: BaseModel](
    make_stream: Callable[[int], AsyncIterator[StreamEvent]],
    schema: type[M],
    on_text: Callable[[str], str | None],
    check: Callable[[M], bool] = lambda _m: True,
) -> AsyncIterator[str | M]:
    """Run a structured call; if the output is invalid, retry exactly once."""
    for attempt in range(2):
        if attempt:
            yield event("reset", {})
        buffer = ""
        try:
            async for ev in make_stream(attempt):
                if isinstance(ev, TextDelta):
                    buffer += ev.text
                    out = on_text(buffer)
                    if out:
                        yield out
                elif isinstance(ev, Finished):
                    result = llm.validate(schema, ev.text)
                    if not check(result) and attempt == 0:
                        raise AIError("invalid_output", "rule check failed")
                    yield result
                    return
        except AIError as e:
            if e.code == "invalid_output" and attempt == 0:
                log.warning("retrying after invalid output")
                continue
            raise
    raise AIError("invalid_output")


def _progress(buffer: str) -> str:
    return event("progress", {"chars": len(buffer)})


@router.get("/health")
async def health() -> dict[str, object]:
    s = get_settings()
    return {
        "ok": True,
        "mock": s.ai_mock,
        "ai_configured": bool(s.anthropic_api_key) or s.ai_mock,
    }


@router.post("/brief")
async def brief(setup: Setup) -> StreamingResponse:
    s = get_settings()

    def make(_attempt: int) -> AsyncIterator[StreamEvent]:
        if s.ai_mock:
            return mock.mock_brief(setup)
        return llm.stream("balanced", SYSTEM_COACH, brief_prompt(setup), s.max_tokens_brief, schema=Brief)

    async def gen() -> AsyncIterator[str]:
        async for item in _structured(make, Brief, _progress):
            if isinstance(item, Brief):
                yield event("result", item.model_dump())
            else:
                yield item

    return _sse(_guard(gen()))


@router.post("/interview/turn")
async def interview_turn(req: TurnRequest) -> StreamingResponse:
    s = get_settings()
    if req.state.done:
        raise HTTPException(409, detail={"code": "interview_over"})
    system = interviewer_system(req.setup, req.interviewer)

    def make(attempt: int) -> AsyncIterator[StreamEvent]:
        if s.ai_mock:
            return mock.mock_turn(req)
        plan = plan_for(req)
        if attempt:
            plan += " Follow this instruction exactly."
        return llm.stream(
            "fast",
            system,
            interviewer_user(req, plan),
            s.max_tokens_turn,
            InterviewerReply,
            cache_system=True,
        )

    def on_text(buffer: str) -> str | None:
        say = partial_json_string(buffer, "say")
        return event("say", {"text": say}) if say else None

    async def gen() -> AsyncIterator[str]:
        async for item in _structured(
            make, InterviewerReply, on_text, check=lambda r: not closes_too_early(r.kind, req)
        ):
            if isinstance(item, InterviewerReply):
                turn = apply_reply(item.kind, item.say, req)
                yield event("result", {"kind": turn.kind, "say": turn.say, "state": turn.state.model_dump()})
            else:
                yield item

    return _sse(_guard(gen()))


@router.post("/hint")
async def hint(req: HintRequest) -> StreamingResponse:
    s = get_settings()

    async def gen() -> AsyncIterator[str]:
        source = (
            mock.mock_hint()
            if s.ai_mock
            else llm.stream("fast", SYSTEM_COACH, hint_prompt(req.setup, req.question), s.max_tokens_hint)
        )
        async for ev in source:
            if isinstance(ev, TextDelta):
                yield event("delta", {"text": ev.text})
            else:
                yield event("result", {"text": ev.text.strip()})

    return _sse(_guard(gen()))


@router.post("/report")
async def report(req: ReportRequest) -> StreamingResponse:
    s = get_settings()
    if not any(t.speaker == "candidate" for t in req.transcript):
        raise HTTPException(422, detail={"code": "nothing_to_score"})

    def make(_attempt: int) -> AsyncIterator[StreamEvent]:
        if s.ai_mock:
            return mock.mock_report(req.transcript)
        return llm.stream("capable", SYSTEM_COACH, report_prompt(req), s.max_tokens_report, schema=Report)

    async def gen() -> AsyncIterator[str]:
        async for item in _structured(make, Report, _progress):
            if isinstance(item, Report):
                yield event("result", item.model_dump(by_alias=True))
            else:
                yield item

    return _sse(_guard(gen()))


@router.post("/resume")
async def resume(file: UploadFile) -> dict[str, str]:
    limit = get_settings().max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, detail={"code": "file_too_large"})
    try:
        text = extract_text(file.filename or "", data)
    except ResumeParseError as e:
        raise HTTPException(422, detail={"code": f"resume_{e}"}) from e
    return {"text": text}

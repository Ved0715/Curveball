"""All database reads and writes. Routes call these; nothing else touches the ORM."""

import random
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import AppError
from app.models import Brief, InterviewSession, Profile, Report, Turn, Usage, User
from app.schemas import InterviewState, Setup, TurnKind
from app.schemas import Turn as TurnSchema

INTERVIEWERS = ["Priya", "Daniel", "Meera", "Arjun", "Sofia", "Rahul", "Hannah", "Kabir"]


async def create_session(db: AsyncSession, user: User, setup: Setup) -> InterviewSession:
    s = InterviewSession(
        user_id=user.id,
        role=setup.role.strip(),
        company=setup.company.strip(),
        level=setup.level,
        round=setup.round,
        style=setup.style,
        question_count=setup.question_count,
        jd_text=setup.jd,
        resume_text=setup.resume,
        interviewer=random.choice(INTERVIEWERS),
        status="setup",
    )
    db.add(s)
    # Keep the latest resume on the profile so it can be reused (and deleted) in one place.
    profile = await db.get(Profile, user.id)
    if profile:
        profile.resume_text = setup.resume
    else:
        db.add(Profile(user_id=user.id, resume_text=setup.resume))
    await db.commit()
    return await get_owned_session(db, user.id, s.id)


async def get_owned_session(db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID) -> InterviewSession:
    s = await db.scalar(
        select(InterviewSession)
        .where(InterviewSession.id == session_id, InterviewSession.user_id == user_id)
        .options(
            selectinload(InterviewSession.turns),
            selectinload(InterviewSession.brief),
            selectinload(InterviewSession.report),
        )
        .execution_options(populate_existing=True)
    )
    if s is None:
        # Same answer for "doesn't exist" and "not yours", so ids can't be probed.
        raise AppError(404, "not_found")
    return s


def setup_of(s: InterviewSession) -> Setup:
    return Setup.model_validate(
        {
            "role": s.role,
            "company": s.company,
            "level": s.level,
            "round": s.round,
            "style": s.style,
            "question_count": s.question_count,
            "jd": s.jd_text,
            "resume": s.resume_text,
        }
    )


def transcript_of(s: InterviewSession) -> list[TurnSchema]:
    return [
        TurnSchema.model_validate(
            {"speaker": t.speaker, "text": t.text, "kind": t.kind, "answer_seconds": t.answer_seconds}
        )
        for t in s.turns
    ]


def state_of(s: InterviewSession) -> InterviewState:
    return InterviewState(main_asked=s.main_asked, followup_used=s.followup_used, done=s.status == "done")


def iso(dt: datetime) -> str:
    """ISO 8601 with an explicit UTC offset (SQLite returns naive datetimes)."""
    return (dt if dt.tzinfo else dt.replace(tzinfo=UTC)).isoformat()


def to_out(s: InterviewSession) -> dict[str, Any]:
    """The session as the frontend sees it."""
    return {
        "id": str(s.id),
        "setup": setup_of(s).model_dump(),
        "interviewer": s.interviewer,
        "status": s.status,
        "state": state_of(s).model_dump(),
        "brief": s.brief.content if s.brief else None,
        "resume_profile": s.resume_profile,
        "turns": [t.model_dump(exclude_none=True) for t in transcript_of(s)],
        "report": s.report.content if s.report else None,
        "created_at": iso(s.created_at),
    }


def add_turn(
    db: AsyncSession,
    s: InterviewSession,
    speaker: str,
    text: str,
    kind: TurnKind | None = None,
    answer_seconds: int | None = None,
) -> Turn:
    t = Turn(
        session_id=s.id,
        index=len(s.turns),
        speaker=speaker,
        kind=kind,
        text=text,
        answer_seconds=answer_seconds,
    )
    s.turns.append(t)
    return t


def save_brief(s: InterviewSession, content: dict[str, Any]) -> None:
    s.brief = Brief(session_id=s.id, content=content)
    if s.status == "setup":
        s.status = "brief"


def save_report(s: InterviewSession, content: dict[str, Any]) -> None:
    s.report = Report(
        session_id=s.id, overall=content["overall"], verdict=content["verdict"], content=content
    )


async def record_usage(
    db: AsyncSession, user_id: uuid.UUID, tokens_in: int, tokens_out: int, calls: int = 1
) -> None:
    """Add AI calls to today's usage row (insert or increment)."""
    today = datetime.now(UTC).date()
    values = {
        "user_id": user_id,
        "date": today,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "calls": calls,
    }
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    stmt = insert(Usage).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Usage.user_id, Usage.date],
        set_={
            "tokens_in": Usage.tokens_in + tokens_in,
            "tokens_out": Usage.tokens_out + tokens_out,
            "calls": Usage.calls + calls,
        },
    )
    await db.execute(stmt)


async def calls_today(db: AsyncSession, user_id: uuid.UUID) -> int:
    row = await db.get(Usage, (user_id, datetime.now(UTC).date()))
    return row.calls if row else 0


async def history(db: AsyncSession, user: User, limit: int = 50) -> list[dict[str, Any]]:
    rows = await db.execute(
        select(InterviewSession, Report)
        .join(Report, Report.session_id == InterviewSession.id)
        .where(InterviewSession.user_id == user.id)
        .order_by(Report.created_at.desc())
        .limit(limit)
    )
    return [
        {
            "id": str(s.id),
            "role": s.role,
            "company": s.company,
            "round": s.round,
            "level": s.level,
            "style": s.style,
            "interviewer": s.interviewer,
            "date": iso(r.created_at),
            "overall": r.overall,
            "verdict": r.verdict,
        }
        for s, r in rows
    ]


async def delete_session(db: AsyncSession, user: User, session_id: uuid.UUID) -> None:
    await db.execute(
        delete(InterviewSession).where(InterviewSession.id == session_id, InterviewSession.user_id == user.id)
    )
    await db.commit()


async def delete_user(db: AsyncSession, user: User) -> None:
    """Delete my data: the user row and, by cascade, everything they own."""
    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()

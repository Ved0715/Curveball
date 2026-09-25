"""The daily learning loop: today's topic, lesson, reflection, history, stats, preferences, queue."""

import uuid
from collections import Counter
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime
from typing import Any, Literal

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app import learning, llm, mock, repo
from app.config import get_settings
from app.db import get_sessionmaker
from app.deps import CurrentUser, Db, ensure_ai_quota
from app.errors import AppError
from app.llm import StreamEvent
from app.models import Assignment, QueueItem
from app.prompts.lesson import Lesson, lesson_prompt
from app.repo import iso
from app.sse import event
from app.streaming import Tally, progress, save_usage, sse_response, structured

router = APIRouter(prefix="/api/learn", tags=["learn"])

SYSTEM_TEACHER = "You are Curveball, a sharp, warm senior engineer who teaches one idea at a time."


class AssignmentOut(BaseModel):
    id: str
    date: str
    topic_id: str | None
    category: str
    title: str
    blurb: str
    explore: list[str]
    source: str
    completed: bool
    assigned_at: str
    completed_at: str | None
    note: str | None
    lesson: dict[str, Any] | None
    check_done: bool


def out(a: Assignment) -> AssignmentOut:
    return AssignmentOut(
        id=str(a.id),
        date=a.date.isoformat(),
        topic_id=a.topic_id,
        category=a.category,
        title=a.title,
        blurb=a.blurb,
        explore=list(a.explore or []),
        source=a.source,
        completed=a.completed,
        assigned_at=iso(a.assigned_at),
        completed_at=iso(a.completed_at) if a.completed_at else None,
        note=a.note,
        lesson=a.lesson,
        check_done=a.check_done,
    )


class TodayOut(BaseModel):
    today: str
    assignment: AssignmentOut | None
    streak: int
    longest: int
    queue_count: int


async def _today_row(db: Db, user: CurrentUser) -> Assignment:
    row = await learning.assign_today(db, user)
    if row is None:
        raise AppError(409, "no_topics")
    return row


@router.get("/today")
async def today(db: Db, user: CurrentUser) -> TodayOut:
    """Today's topic. Assigns one on the spot if the daily job hasn't yet (PRD §5.1)."""
    day = learning.local_today(user)
    row = await learning.assign_today(db, user, day)
    current, longest = learning.streaks(await learning.completed_days(db, user.id), day)
    queued = await db.scalar(select(func.count()).select_from(QueueItem).where(QueueItem.user_id == user.id))
    return TodayOut(
        today=day.isoformat(),
        assignment=out(row) if row else None,
        streak=current,
        longest=longest,
        queue_count=queued or 0,
    )


class CompleteIn(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


@router.post("/today/complete")
async def complete(body: CompleteIn, db: Db, user: CurrentUser) -> AssignmentOut:
    row = await _today_row(db, user)
    if row.completed:
        raise AppError(409, "already_completed")
    row.completed = True
    row.completed_at = datetime.now(UTC)
    if body.note and body.note.strip():
        row.note = body.note.strip()
    await db.commit()
    return out(row)


@router.post("/today/swap")
async def swap(db: Db, user: CurrentUser) -> AssignmentOut:
    row = await _today_row(db, user)
    if row.completed:
        raise AppError(409, "already_completed")
    swapped = await learning.swap_today(db, user, row)
    if swapped is None:
        raise AppError(409, "no_topics")
    return out(swapped)


class NoteIn(BaseModel):
    note: str = Field(max_length=2000)


@router.put("/today/note")
async def note(body: NoteIn, db: Db, user: CurrentUser) -> AssignmentOut:
    row = await _today_row(db, user)
    row.note = body.note.strip() or None
    await db.commit()
    return out(row)


@router.post("/today/check")
async def check_done(db: Db, user: CurrentUser) -> AssignmentOut:
    row = await _today_row(db, user)
    if not row.lesson:
        raise AppError(409, "no_lesson")
    row.check_done = True
    await db.commit()
    return out(row)


@router.post("/today/lesson")
async def lesson(db: Db, user: CurrentUser) -> Any:
    """Stream a 5-minute lesson for today's topic; cached on the assignment after the first time."""
    row = await _today_row(db, user)
    if row.lesson:
        cached = row.lesson

        async def once() -> AsyncIterator[str]:
            yield event("result", cached)

        return sse_response(once())
    await ensure_ai_quota(db, user)
    settings = get_settings()
    row_id, user_id = row.id, user.id
    prompt = lesson_prompt(row.title, row.blurb, row.category, "an early-career software engineer")

    def make(_attempt: int) -> AsyncIterator[StreamEvent]:
        if settings.ai_mock:
            return mock.mock_lesson(row.title)
        return llm.stream("balanced", SYSTEM_TEACHER, prompt, settings.max_tokens_lesson, schema=Lesson)

    async def gen() -> AsyncIterator[str]:
        tally = Tally()
        try:
            async for item in structured(make, Lesson, progress, tally):
                if isinstance(item, Lesson):
                    content = item.model_dump()
                    async with get_sessionmaker()() as db2:
                        r = await db2.get(Assignment, row_id)
                        if r is not None and r.user_id == user_id and not r.lesson:
                            r.lesson = content
                            await db2.commit()
                    yield event("result", content)
                else:
                    yield item
        finally:
            await save_usage(user_id, tally)

    return sse_response(gen())


@router.get("/history")
async def history(
    db: Db, user: CurrentUser, limit: int = Query(60, ge=1, le=200), before: date | None = None
) -> list[AssignmentOut]:
    q = select(Assignment).where(Assignment.user_id == user.id, Assignment.completed)
    if before is not None:
        q = q.where(Assignment.date < before)
    rows = await db.scalars(q.order_by(Assignment.date.desc()).limit(limit))
    return [out(r) for r in rows]


class Stats(BaseModel):
    streak: int
    longest: int
    total: int
    rate_7: float
    rate_30: float
    by_category: dict[str, int]
    by_category_30: dict[str, int]


@router.get("/stats")
async def stats(db: Db, user: CurrentUser) -> Stats:
    day = learning.local_today(user)
    rows = (
        await db.execute(
            select(Assignment.date, Assignment.category).where(
                Assignment.user_id == user.id, Assignment.completed
            )
        )
    ).all()
    done = {d for d, _ in rows}
    current, longest = learning.streaks(done, day)
    since = learning.local_date(user.created_at, user.timezone) if user.created_at else None
    first = min(done) if done else None
    start = min(x for x in (since, first) if x is not None) if (since or first) else None
    return Stats(
        streak=current,
        longest=longest,
        total=len(rows),
        rate_7=learning.completion_rate(done, day, 7, start),
        rate_30=learning.completion_rate(done, day, 30, start),
        by_category=dict(Counter(c for _, c in rows)),
        by_category_30=dict(Counter(c for d, c in rows if (day - d).days < 30)),
    )


# ---------- Preferences ----------


class PrefsOut(BaseModel):
    focus_areas: list[str]


class PrefsIn(BaseModel):
    focus_areas: list[Literal["dsa", "system-design", "lang-depth", "fundamentals", "real-world"]]


@router.get("/preferences")
async def get_prefs(db: Db, user: CurrentUser) -> PrefsOut:
    prefs = await learning.preferences(db, user.id)
    await db.commit()
    return PrefsOut(focus_areas=prefs.focus_areas)


@router.put("/preferences")
async def put_prefs(body: PrefsIn, db: Db, user: CurrentUser) -> PrefsOut:
    if not body.focus_areas:
        raise AppError(422, "focus_required")
    prefs = await learning.preferences(db, user.id)
    prefs.focus_areas = [t for t in learning.TRACKS if t in set(body.focus_areas)]
    await db.commit()
    return PrefsOut(focus_areas=prefs.focus_areas)


# ---------- Queue ----------


class QueueOut(BaseModel):
    id: str
    title: str
    blurb: str
    source: str
    session_id: str | None
    created_at: str


class QueueIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    blurb: str = Field(default="", max_length=600)
    source: Literal["manual", "interview"] = "manual"
    session_id: uuid.UUID | None = None


def qout(q: QueueItem) -> QueueOut:
    return QueueOut(
        id=str(q.id),
        title=q.title,
        blurb=q.blurb,
        source=q.source,
        session_id=str(q.session_id) if q.session_id else None,
        created_at=iso(q.created_at),
    )


QUEUE_LIMIT = 50


@router.get("/queue")
async def list_queue(db: Db, user: CurrentUser) -> list[QueueOut]:
    rows = await db.scalars(
        select(QueueItem).where(QueueItem.user_id == user.id).order_by(*learning.QUEUE_ORDER)
    )
    return [qout(q) for q in rows]


class QueueOrderIn(BaseModel):
    ids: list[uuid.UUID] = Field(max_length=QUEUE_LIMIT)


@router.put("/queue/order")
async def reorder_queue(body: QueueOrderIn, db: Db, user: CurrentUser) -> list[QueueOut]:
    """Set the queue order (first id = learned next). Unlisted items keep their order after."""
    rows = list(
        await db.scalars(
            select(QueueItem).where(QueueItem.user_id == user.id).order_by(*learning.QUEUE_ORDER)
        )
    )
    by_id = {r.id: r for r in rows}
    ordered = [by_id[i] for i in dict.fromkeys(body.ids) if i in by_id]
    ordered += [r for r in rows if r not in ordered]
    for pos, r in enumerate(ordered, start=1):
        r.position = pos
    await db.commit()
    return [qout(q) for q in ordered]


@router.post("/queue", status_code=status.HTTP_201_CREATED)
async def add_queue(body: QueueIn, db: Db, user: CurrentUser) -> QueueOut:
    count = await db.scalar(select(func.count()).select_from(QueueItem).where(QueueItem.user_id == user.id))
    if (count or 0) >= QUEUE_LIMIT:
        raise AppError(409, "queue_full")
    title = body.title.strip()
    dup = await db.scalar(
        select(QueueItem).where(QueueItem.user_id == user.id, func.lower(QueueItem.title) == title.lower())
    )
    if dup is not None:
        return qout(dup)  # adding the same thing twice is a no-op
    if body.session_id is not None:
        await repo.get_owned_session(db, user.id, body.session_id)  # 404 if not theirs
    item = QueueItem(
        user_id=user.id,
        title=title,
        blurb=body.blurb.strip(),
        source=body.source,
        session_id=body.session_id,
        position=await learning.next_queue_position(db, user.id),
    )
    db.add(item)
    await db.commit()
    return qout(item)


@router.delete("/queue/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_queue(item_id: uuid.UUID, db: Db, user: CurrentUser) -> Response:
    item = await db.get(QueueItem, item_id)
    if item is not None and item.user_id == user.id:
        await db.delete(item)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

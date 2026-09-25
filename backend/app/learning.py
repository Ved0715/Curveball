"""The daily learning engine (docs/Learning Log PRD.md §5–§8).

One shared `assign_today()` is used by both the lazy path (GET /api/learn/today) and the
scheduled job (POST /internal/assign-daily). Streaks, stats and XP are always derived
from assignment rows; nothing is stored as a counter that could drift.
"""

import json
import uuid
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Assignment, LearnPreferences, QueueItem, Topic, User

TRACKS = ["dsa", "system-design", "lang-depth", "fundamentals", "real-world"]
QUEUE_ORDER = (QueueItem.position, QueueItem.created_at, QueueItem.id)
LOOKBACK_DAYS = 60
REAL_WORLD_EVERY = 4  # at most this many days without a real-world topic
BALANCE_WINDOW = 14
CURRICULUM_FILE = Path(__file__).parent / "curriculum.json"


# ---------- Time ----------


def local_today(user: User, now: datetime | None = None) -> date:
    return (now or datetime.now(UTC)).astimezone(ZoneInfo(user.timezone)).date()


def local_date(when: datetime, tz: str) -> date:
    """The user's calendar day for a stored timestamp. Naive values (SQLite) are UTC."""
    aware = when if when.tzinfo else when.replace(tzinfo=UTC)
    return aware.astimezone(ZoneInfo(tz)).date()


# ---------- Selection (pure) ----------


@dataclass(frozen=True)
class TopicLite:
    id: str
    category: str


@dataclass(frozen=True)
class Past:
    day: date
    topic_id: str | None
    category: str


def select_topic(
    topics: Sequence[TopicLite],
    history: Sequence[Past],
    enabled: Sequence[str],
    today: date,
    exclude: Iterable[str] = (),
) -> TopicLite | None:
    """Pick today's curriculum topic. Pure and deterministic, so it's fully testable."""
    excluded = set(exclude)
    pool = [t for t in topics if t.category in enabled and t.id not in excluded]
    if not pool:
        pool = [t for t in topics if t.category in enabled]
    if not pool:
        return None

    past = [p for p in history if p.day < today]
    last_used: dict[str, date] = {}
    for p in past:
        if p.topic_id and (p.topic_id not in last_used or p.day > last_used[p.topic_id]):
            last_used[p.topic_id] = p.day

    # Not used in the lookback window; otherwise least-recently-used (never fail to assign).
    fresh = [t for t in pool if t.id not in last_used or (today - last_used[t.id]).days > LOOKBACK_DAYS]
    if fresh:
        candidates = fresh
    else:
        oldest = min(last_used[t.id] for t in pool)
        candidates = [t for t in pool if last_used[t.id] == oldest]

    by_day = {p.day: p.category for p in past}
    # Real-world at least every REAL_WORLD_EVERY days (PRD §8.5).
    recent_real = any(
        by_day.get(today - timedelta(days=d)) == "real-world" for d in range(1, REAL_WORLD_EVERY)
    )
    real = [t for t in candidates if t.category == "real-world"]
    if "real-world" in enabled and real and not recent_real and len(past) >= REAL_WORLD_EVERY - 1:
        candidates = real
    else:
        # Avoid the same track two days running.
        yesterday = by_day.get(today - timedelta(days=1))
        different = [t for t in candidates if t.category != yesterday]
        candidates = different or candidates

    # Breadth: the least-covered track over the last two weeks wins; ties go to track order.
    recent = Counter(p.category for p in past if (today - p.day).days <= BALANCE_WINDOW)
    cats = sorted(
        {t.category for t in candidates}, key=lambda c: (recent[c], TRACKS.index(c) if c in TRACKS else 99)
    )
    chosen = cats[0]
    # Within a track, follow curriculum order (dsa-01 before dsa-02).
    return sorted((t for t in candidates if t.category == chosen), key=lambda t: t.id)[0]


# ---------- Streaks & stats (pure) ----------


def streaks(done_days: Iterable[date], today: date) -> tuple[int, int]:
    """(current, longest). Current counts back from today, or from yesterday if today isn't done
    yet, so a streak doesn't die at midnight before the user has had a chance to act."""
    days = set(done_days)
    longest = run = 0
    prev: date | None = None
    for d in sorted(days):
        run = run + 1 if prev is not None and d - prev == timedelta(days=1) else 1
        longest = max(longest, run)
        prev = d
    cursor = today if today in days else today - timedelta(days=1)
    current = 0
    while cursor in days:
        current += 1
        cursor -= timedelta(days=1)
    return current, max(longest, current)


def completion_rate(done_days: set[date], today: date, window: int, since: date | None = None) -> float:
    """Share of the last `window` days (including today) with a completion, not counting days
    before the account existed."""
    days = [today - timedelta(days=i) for i in range(window)]
    if since is not None:
        days = [d for d in days if d >= since]
    return 0.0 if not days else sum(d in done_days for d in days) / len(days)


XP_LEARNED, XP_NOTE, XP_CHECK, XP_INTERVIEW = 10, 5, 5, 20
LEVELS = [
    "Rookie", "Apprentice", "Builder", "Debugger", "Problem Solver",
    "Systems Thinker", "Tech Lead Energy", "Staff Material", "Curveball Legend",
]  # fmt: skip


def level_for(xp: int) -> dict[str, Any]:
    """Level n starts at 25·n·(n−1) XP: 0, 50, 150, 300, 500, …"""
    n = 1
    while 25 * (n + 1) * n <= xp:
        n += 1
    start, nxt = 25 * n * (n - 1), 25 * (n + 1) * n
    return {
        "level": n,
        "title": LEVELS[min(n, len(LEVELS)) - 1],
        "xp": xp,
        "level_start": start,
        "next_level": nxt,
        "progress": (xp - start) / (nxt - start),
    }


# ---------- Curriculum ----------


def load_curriculum() -> list[dict[str, Any]]:
    return list(json.loads(CURRICULUM_FILE.read_text())["topics"])


async def sync_curriculum(db: AsyncSession) -> int:
    """Upsert curriculum.json into `topics` (idempotent; runs at startup). Returns rows written."""
    existing = {t.id: t for t in (await db.scalars(select(Topic))).all()}
    n = 0
    for item in load_curriculum():
        row = existing.get(item["id"])
        if row is None:
            db.add(Topic(**item))
            n += 1
        elif (row.category, row.title, row.blurb, row.explore) != (
            item["category"], item["title"], item["blurb"], item["explore"],
        ):  # fmt: skip
            row.category, row.title, row.blurb, row.explore = (
                item["category"], item["title"], item["blurb"], item["explore"],
            )  # fmt: skip
            n += 1
    await db.commit()
    return n


# ---------- Assignment (DB) ----------


async def preferences(db: AsyncSession, user_id: uuid.UUID) -> LearnPreferences:
    prefs = await db.get(LearnPreferences, user_id)
    if prefs is None:
        prefs = LearnPreferences(user_id=user_id, focus_areas=list(TRACKS))
        db.add(prefs)
        await db.flush()
    return prefs


async def assignment_for(db: AsyncSession, user_id: uuid.UUID, day: date) -> Assignment | None:
    return await db.scalar(select(Assignment).where(Assignment.user_id == user_id, Assignment.date == day))


async def _history(db: AsyncSession, user_id: uuid.UUID) -> list[Past]:
    rows = await db.execute(
        select(Assignment.date, Assignment.topic_id, Assignment.category).where(Assignment.user_id == user_id)
    )
    return [Past(d, t, c) for d, t, c in rows]


async def _pick(
    db: AsyncSession, user_id: uuid.UUID, today: date, exclude: set[str], use_queue: bool
) -> dict[str, Any] | None:
    if use_queue:
        item = await db.scalar(
            select(QueueItem).where(QueueItem.user_id == user_id).order_by(*QUEUE_ORDER).limit(1)
        )
        if item is not None:
            await db.delete(item)
            return {
                "topic_id": None,
                "category": "custom",
                "title": item.title,
                "blurb": item.blurb or "A topic you queued up yourself.",
                "explore": [],
                "source": "interview" if item.source == "interview" else "queue",
            }
    prefs = await preferences(db, user_id)
    topics = (await db.scalars(select(Topic))).all()
    choice = select_topic(
        [TopicLite(t.id, t.category) for t in topics],
        await _history(db, user_id),
        prefs.focus_areas,
        today,
        exclude,
    )
    if choice is None:
        return None
    t = next(t for t in topics if t.id == choice.id)
    return {
        "topic_id": t.id, "category": t.category, "title": t.title,
        "blurb": t.blurb, "explore": t.explore, "source": "auto",
    }  # fmt: skip


async def assign_today(db: AsyncSession, user: User, today: date | None = None) -> Assignment | None:
    """Today's assignment, creating it if needed. Idempotent and safe to call concurrently."""
    day = today or local_today(user)
    existing = await assignment_for(db, user.id, day)
    if existing is not None:
        return existing
    picked = await _pick(db, user.id, day, set(), use_queue=True)
    if picked is None:
        return None
    row = Assignment(user_id=user.id, date=day, **picked)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:  # another request assigned it first
        await db.rollback()
        return await assignment_for(db, user.id, day)
    return row


async def swap_today(db: AsyncSession, user: User, row: Assignment) -> Assignment | None:
    """Replace today's topic with a different curriculum pick. A swapped-away queued topic
    goes back to the end of the queue so the user never loses something they asked for."""
    if row.source in ("queue", "interview"):
        db.add(
            QueueItem(
                user_id=user.id,
                title=row.title,
                blurb=row.blurb,
                source="interview" if row.source == "interview" else "manual",
                position=await next_queue_position(db, user.id),
            )
        )
    exclude = {row.topic_id} if row.topic_id else set()
    picked = await _pick(db, user.id, row.date, exclude, use_queue=False)
    if picked is None:
        return None
    for k, v in picked.items():
        setattr(row, k, v)
    row.assigned_at = datetime.now(UTC)
    row.lesson = None
    row.check_done = False
    await db.commit()
    return row


async def completed_days(db: AsyncSession, user_id: uuid.UUID) -> set[date]:
    rows = await db.scalars(
        select(Assignment.date).where(Assignment.user_id == user_id, Assignment.completed)
    )
    return set(rows)


async def next_queue_position(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Position that puts a new item at the end of the user's queue."""
    last = await db.scalar(select(func.max(QueueItem.position)).where(QueueItem.user_id == user_id))
    return (last or 0) + 1

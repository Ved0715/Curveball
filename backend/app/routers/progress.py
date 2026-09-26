"""One view of growth across both loops: learning and interviews. All derived, nothing stored."""

from collections import Counter
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app import learning
from app.deps import CurrentUser, Db
from app.models import Assignment, InterviewSession, Report, WorkNode, WorkSession

router = APIRouter(prefix="/api/progress", tags=["progress"])


class Day(BaseModel):
    date: str
    learned: bool
    title: str | None
    category: str | None
    interviews: int


class Progress(BaseModel):
    today: str
    level: dict[str, Any]
    streak: int
    longest: int
    learned_total: int
    interviews_total: int
    shipped_total: int  # Bullpen leaves done
    avg_score: float | None
    best_score: int | None
    rate_30: float
    calendar: list[Day]
    balance_30: dict[str, int]
    balance_all: dict[str, int]
    score_trend: list[dict[str, Any]]


@router.get("")
async def progress(db: Db, user: CurrentUser, days: int = Query(84, ge=7, le=371)) -> Progress:
    today = learning.local_today(user)
    rows = (await db.scalars(select(Assignment).where(Assignment.user_id == user.id))).all()
    done = [a for a in rows if a.completed]
    done_days = {a.date for a in done}
    current, longest = learning.streaks(done_days, today)

    reports = (
        await db.execute(
            select(Report.overall, Report.created_at)
            .join(InterviewSession, InterviewSession.id == Report.session_id)
            .where(InterviewSession.user_id == user.id)
            .order_by(Report.created_at)
        )
    ).all()
    report_days = [learning.local_date(c, user.timezone) for _, c in reports]

    shipped = int(
        await db.scalar(
            select(func.count())
            .select_from(WorkNode)
            .join(WorkSession, WorkSession.id == WorkNode.session_id)
            .where(WorkSession.user_id == user.id, WorkNode.is_leaf, WorkNode.status == "done")
        )
        or 0
    )
    xp = (
        learning.XP_SHIPPED * shipped
        + learning.XP_LEARNED * len(done)
        + learning.XP_NOTE * sum(1 for a in done if a.note)
        + learning.XP_CHECK * sum(1 for a in rows if a.check_done)
        + sum(learning.XP_INTERVIEW + round(o / 10) for o, _ in reports)
    )

    by_date = {a.date: a for a in rows}
    per_day_interviews = Counter(report_days)
    calendar = []
    for i in range(days - 1, -1, -1):
        d: date = today - timedelta(days=i)
        a = by_date.get(d)
        calendar.append(
            Day(
                date=d.isoformat(),
                learned=bool(a and a.completed),
                title=a.title if a else None,
                category=a.category if a else None,
                interviews=per_day_interviews.get(d, 0),
            )
        )

    since = learning.local_date(user.created_at, user.timezone)
    first = min(done_days) if done_days else since
    scores = [o for o, _ in reports]
    return Progress(
        today=today.isoformat(),
        level=learning.level_for(xp),
        shipped_total=shipped,
        streak=current,
        longest=longest,
        learned_total=len(done),
        interviews_total=len(reports),
        avg_score=round(sum(scores) / len(scores), 1) if scores else None,
        best_score=max(scores) if scores else None,
        rate_30=learning.completion_rate(done_days, today, 30, min(since, first)),
        calendar=calendar,
        balance_30=dict(Counter(a.category for a in done if (today - a.date).days < 30)),
        balance_all=dict(Counter(a.category for a in done)),
        score_trend=[
            {"date": d.isoformat(), "overall": o} for (o, _), d in zip(reports, report_days, strict=True)
        ][-20:],
    )

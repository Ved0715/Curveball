"""Endpoints for schedulers only (cron / GitHub Actions / platform cron), protected by a shared token."""

import hmac
import logging
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Header
from sqlalchemy import select

from app import learning
from app.config import get_settings
from app.deps import Db
from app.errors import AppError
from app.models import JobRun, User

log = logging.getLogger("mockroom.jobs")
router = APIRouter(prefix="/internal", tags=["internal"], include_in_schema=False)


def _check(token: str | None) -> None:
    expected = get_settings().internal_token
    if not expected or not token or not hmac.compare_digest(token, expected):
        raise AppError(404, "not_found")  # don't advertise that the route exists


@router.post("/assign-daily")
async def assign_daily(db: Db, x_internal_token: Annotated[str | None, Header()] = None) -> dict[str, Any]:
    """Assign today's topic to every user, in their own timezone. Idempotent (PRD §8)."""
    _check(x_internal_token)
    started = datetime.now(UTC)
    counts = {"assigned": 0, "existing": 0, "failed": 0}
    user_ids = list(await db.scalars(select(User.id)))
    for uid in user_ids:
        try:
            user = await db.get(User, uid)
            if user is None:
                continue
            day = learning.local_today(user)
            if await learning.assignment_for(db, uid, day) is not None:
                counts["existing"] += 1
                continue
            row = await learning.assign_today(db, user, day)
            counts["assigned" if row is not None else "failed"] += 1
        except Exception:
            await db.rollback()
            counts["failed"] += 1
            log.exception("assign-daily failed for a user")
    status = "ok" if counts["failed"] == 0 else "failed"
    db.add(JobRun(job="assign-daily", status=status, detail=counts, started_at=started))
    await db.commit()
    log.info("assign-daily %s %s", status, counts)
    return {"status": status, **counts}

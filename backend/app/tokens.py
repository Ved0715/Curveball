"""Personal access tokens for MCP clients (Claude Code, Cursor, ...).

A token looks like `cbk_<43 random chars>`. Only its SHA-256 is stored; the raw value is
shown once, at creation. Lookups are cached for a few seconds, and revoking clears the cache,
so an agent making dozens of calls doesn't cost a database round trip each.
"""

import hashlib
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ApiToken, User

PREFIX = "cbk_"
MAX_TOKENS = 10
_CACHE_SECONDS = 30
_TOUCH_EVERY = timedelta(minutes=5)
_cache: dict[str, tuple[uuid.UUID, float]] = {}


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def looks_like_token(raw: str) -> bool:
    return raw.startswith(PREFIX) and 20 <= len(raw) <= 100


async def create(db: AsyncSession, user_id: uuid.UUID, name: str) -> tuple[ApiToken, str]:
    raw = PREFIX + secrets.token_urlsafe(32)
    row = ApiToken(
        user_id=user_id, name=name.strip()[:80] or "MCP client", token_hash=_hash(raw), prefix=raw[:8]
    )
    db.add(row)
    await db.commit()
    return row, raw


async def list_for(db: AsyncSession, user_id: uuid.UUID) -> list[ApiToken]:
    rows = await db.scalars(
        select(ApiToken)
        .where(ApiToken.user_id == user_id, ApiToken.revoked_at.is_(None))
        .order_by(ApiToken.created_at.desc())
    )
    return list(rows)


async def revoke(db: AsyncSession, user_id: uuid.UUID, token_id: uuid.UUID) -> bool:
    row = await db.get(ApiToken, token_id)
    if row is None or row.user_id != user_id or row.revoked_at is not None:
        return False
    row.revoked_at = datetime.now(UTC)
    _cache.pop(row.token_hash, None)
    await db.commit()
    return True


async def user_for(db: AsyncSession, raw: str) -> User | None:
    if not looks_like_token(raw):
        return None
    h = _hash(raw)
    hit = _cache.get(h)
    if hit and hit[1] > time.monotonic():
        return await db.get(User, hit[0])
    row = await db.scalar(select(ApiToken).where(ApiToken.token_hash == h, ApiToken.revoked_at.is_(None)))
    if row is None:
        _cache.pop(h, None)
        return None
    now = datetime.now(UTC)
    last = (
        row.last_used_at
        if row.last_used_at is None or row.last_used_at.tzinfo
        else row.last_used_at.replace(tzinfo=UTC)
    )
    if last is None or now - last > _TOUCH_EVERY:
        row.last_used_at = now
        await db.commit()
    _cache[h] = (row.user_id, time.monotonic() + _CACHE_SECONDS)
    return await db.get(User, row.user_id)


def clear_cache() -> None:
    _cache.clear()

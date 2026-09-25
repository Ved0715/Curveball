"""Accounts and sessions.

- Passwords: argon2id (argon2-cffi defaults), rehashed automatically if parameters change.
- Sessions: a random 256-bit token lives only in an httpOnly cookie; the database stores
  its SHA-256, so a database leak can't be replayed as a login. Sessions last 30 days and
  are extended while in use; logging out deletes the row.
"""

import asyncio
import hashlib
import secrets
import time
import uuid
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AuthSession, LearnPreferences, User

COOKIE = "cb_session"
SESSION_DAYS = 30
EXTEND_WHEN_LESS_THAN = timedelta(days=15)
ALL_TRACKS = ["dsa", "system-design", "lang-depth", "fundamentals", "real-world"]

_hasher = PasswordHasher()
# Verified against when the email doesn't exist, so "no such user" takes as long as "wrong password".
_DUMMY_HASH = _hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


# argon2 is deliberately slow CPU work; run it in a thread so other requests keep flowing.
async def hash_password_async(password: str) -> str:
    return await asyncio.to_thread(hash_password, password)


async def verify_password_async(password_hash: str, password: str) -> bool:
    return await asyncio.to_thread(verify_password, password_hash, password)


def valid_timezone(tz: str) -> bool:
    try:
        ZoneInfo(tz)
        return True
    except (ZoneInfoNotFoundError, ValueError):
        return False


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def find_user(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(User.email == normalize_email(email)))


async def create_user(db: AsyncSession, email: str, password: str, name: str, timezone: str) -> User:
    user = User(
        email=normalize_email(email),
        password_hash=await hash_password_async(password),
        name=name.strip(),
        timezone=timezone if valid_timezone(timezone) else "Asia/Kolkata",
    )
    db.add(user)
    await db.flush()
    db.add(LearnPreferences(user_id=user.id, focus_areas=list(ALL_TRACKS)))
    await db.commit()
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> User | None:
    user = await find_user(db, email)
    if user is None:
        await verify_password_async(_DUMMY_HASH, password)
        return None
    if not await verify_password_async(user.password_hash, password):
        return None
    if _hasher.check_needs_rehash(user.password_hash):
        user.password_hash = await hash_password_async(password)
        await db.commit()
    return user


async def start_session(db: AsyncSession, user: User, user_agent: str, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + timedelta(days=SESSION_DAYS)
    db.add(
        AuthSession(
            user_id=user.id, token_hash=_hash_token(token), user_agent=user_agent[:300], expires_at=expires
        )
    )
    await db.commit()
    set_cookie(response, token, expires)


def set_cookie(response: Response, token: str, expires: datetime) -> None:
    response.set_cookie(
        COOKIE,
        token,
        expires=expires,
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_cookie(response: Response) -> None:
    response.delete_cookie(
        COOKIE, path="/", secure=get_settings().cookie_secure, httponly=True, samesite="lax"
    )


async def user_for_token(db: AsyncSession, token: str) -> User | None:
    # One round trip for session and user together (this runs on every signed-in request).
    found = (
        await db.execute(
            select(AuthSession, User)
            .join(User, User.id == AuthSession.user_id)
            .where(AuthSession.token_hash == _hash_token(token))
        )
    ).first()
    if found is None:
        return None
    row, user = found
    now = datetime.now(UTC)
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
    if expires <= now:
        await db.delete(row)
        await db.commit()
        return None
    if expires - now < EXTEND_WHEN_LESS_THAN:
        row.expires_at = now + timedelta(days=SESSION_DAYS)
        row.last_seen_at = now
        await db.commit()
    return user


async def end_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(AuthSession).where(AuthSession.token_hash == _hash_token(token)))
    await db.commit()


async def end_all_sessions(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(delete(AuthSession).where(AuthSession.user_id == user_id))
    await db.commit()


class RateLimiter:
    """In-process sliding-window limiter. Fine for one server; use Redis when scaling out."""

    def __init__(self, limit: int, window_s: float) -> None:
        self.limit = limit
        self.window = window_s
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True

    def reset(self) -> None:
        self.hits.clear()


login_limiter = RateLimiter(limit=get_settings().login_limit_per_15min, window_s=15 * 60)
signup_limiter = RateLimiter(limit=get_settings().signup_limit_per_hour, window_s=60 * 60)

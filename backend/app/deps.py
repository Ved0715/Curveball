"""Request dependencies: the database session and the signed-in user."""

from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app import auth, repo
from app.config import get_settings
from app.db import get_db
from app.errors import AppError
from app.models import User

Db = Annotated[AsyncSession, Depends(get_db)]


async def current_user(db: Db, cb_session: Annotated[str | None, Cookie()] = None) -> User:
    if not cb_session:
        raise AppError(401, "no_session")
    user = await auth.user_for_token(db, cb_session)
    if user is None:
        raise AppError(401, "no_session")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


async def ensure_ai_quota(db: AsyncSession, user: User) -> None:
    """Reject AI calls past the user's daily cap, before spending anything."""
    if await repo.calls_today(db, user.id) >= get_settings().max_ai_calls_per_day:
        raise AppError(429, "daily_limit")


async def within_ai_quota(db: Db, user: CurrentUser) -> User:
    await ensure_ai_quota(db, user)
    return user


AIUser = Annotated[User, Depends(within_ai_quota)]

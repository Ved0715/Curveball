"""Request dependencies: the database session and the current user."""

import re
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app import repo
from app.config import get_settings
from app.db import get_db
from app.errors import AppError
from app.models import User

CLIENT_ID = re.compile(r"^[A-Za-z0-9_-]{16,64}$")

Db = Annotated[AsyncSession, Depends(get_db)]


async def current_user(db: Db, x_client_id: Annotated[str | None, Header()] = None) -> User:
    """Until sign-in exists, a user is an anonymous browser identified by a random id
    it generates once and sends as `X-Client-Id`. Phase 2 swaps this for real auth."""
    if not x_client_id or not CLIENT_ID.match(x_client_id):
        raise AppError(401, "no_client")
    return await repo.get_or_create_user(db, x_client_id)


CurrentUser = Annotated[User, Depends(current_user)]


async def ensure_ai_quota(db: AsyncSession, user: User) -> None:
    """Reject AI calls past the user's daily cap, before spending anything."""
    if await repo.calls_today(db, user.id) >= get_settings().max_ai_calls_per_day:
        raise AppError(429, "daily_limit")


async def within_ai_quota(db: Db, user: CurrentUser) -> User:
    await ensure_ai_quota(db, user)
    return user


AIUser = Annotated[User, Depends(within_ai_quota)]

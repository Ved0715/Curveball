"""Database engine and sessions (SQLAlchemy 2, async).

Postgres (Neon) in dev/prod via the psycopg 3 driver. Tests use SQLite in memory.
Schema changes go through Alembic migrations (backend/migrations), never create_all,
except for throwaway SQLite databases used by tests.
"""

from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Any

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import get_settings


def normalize_url(url: str) -> str:
    """Neon gives `postgresql://…`; SQLAlchemy needs the driver named: `postgresql+psycopg://…`."""
    url = url.strip().strip("'\"")
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


@lru_cache
def get_engine() -> AsyncEngine:
    raw = get_settings().database_url
    if not raw:
        raise RuntimeError("DATABASE_URL is not set. Add it to backend/.env (see .env.example).")
    url = normalize_url(raw)
    kwargs: dict[str, Any] = {}
    if url.startswith("postgresql"):
        kwargs = {
            # Neon drops connections when it suspends after 5 idle minutes. Recycling anything
            # older than 4 minutes means a pooled connection never outlives a suspend, without
            # pool_pre_ping's extra round trips (measured at 300-550 ms per request to Neon).
            "pool_pre_ping": False,
            "pool_recycle": 240,
            "pool_size": 5,
            "max_overflow": 5,
            # Safe behind Neon's PgBouncer pooler (transaction mode can't share prepared statements).
            "connect_args": {"prepare_threshold": None},
        }
    elif url.startswith("sqlite") and ":memory:" in url:
        # One shared in-memory database across connections (tests).
        kwargs = {"poolclass": StaticPool}
    engine = create_async_engine(url, **kwargs)
    if url.startswith("sqlite"):
        # SQLite ignores foreign keys (and so cascades) unless asked.
        @event.listens_for(engine.sync_engine, "connect")
        def _fk_on(dbapi_conn: Any, _record: Any) -> None:
            dbapi_conn.execute("PRAGMA foreign_keys=ON")

    return engine


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one DB session per request."""
    async with get_sessionmaker()() as session:
        yield session

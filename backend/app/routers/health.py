import asyncio

from fastapi import APIRouter
from sqlalchemy import text

from app.config import get_settings
from app.db import get_engine

router = APIRouter(prefix="/api", tags=["health"])


async def _db_ok() -> bool:
    try:
        async with asyncio.timeout(5):
            async with get_engine().connect() as conn:
                await conn.execute(text("select 1"))
        return True
    except Exception:
        return False


@router.get("/health")
async def health() -> dict[str, bool | str]:
    s = get_settings()
    return {
        "ok": True,
        "mock": s.ai_mock,
        "ai_configured": s.ai_key_present or s.ai_mock,
        "provider": "mock" if s.ai_mock else s.ai_provider,
        "db": await _db_ok(),
    }

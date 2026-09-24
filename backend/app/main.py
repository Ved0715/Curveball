import logging
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import get_engine
from app.errors import install_error_handlers
from app.models import Base
from app.routers import health, history, me, resume, sessions

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if get_settings().db_auto_create:
        # Throwaway SQLite only (tests / e2e). Real databases use `alembic upgrade head`.
        async with get_engine().begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield
    await get_engine().dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Mock Room API", version="0.2.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type", "Authorization", "X-Client-Id"],
        expose_headers=["X-Request-Id"],
    )

    @app.middleware("http")
    async def request_id(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response

    install_error_handlers(app)
    for r in (health.router, sessions.router, history.router, me.router, resume.router):
        app.include_router(r)
    return app


app = create_app()

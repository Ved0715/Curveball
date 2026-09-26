import logging
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.routing import Route
from starlette.types import Receive, Scope, Send

from app import learning, mcp_server
from app.config import get_settings
from app.db import get_engine, get_sessionmaker
from app.errors import install_error_handlers
from app.models import Base
from app.routers import auth, health, history, internal, learn, me, progress, resume, sessions, work

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    if get_settings().db_auto_create:
        # Throwaway SQLite only (tests / e2e). Real databases use `alembic upgrade head`.
        async with get_engine().begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    if get_settings().database_url:
        async with get_sessionmaker()() as db:
            changed = await learning.sync_curriculum(db)
            if changed:
                logging.getLogger("mockroom").info("curriculum: %d topic(s) added or updated", changed)
    mcp_app, mcp_manager = mcp_server.build_http_app()
    app.state.mcp = mcp_app
    async with mcp_manager.run():
        yield
    await get_engine().dispose()


class McpEndpoint:
    """/api/mcp: Bullpen's MCP server for coding agents (see app/mcp_server.py). A class so
    Starlette mounts it as a raw ASGI app rather than a request handler."""

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        await scope["app"].state.mcp(scope, receive, send)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Curveball API", version="0.3.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
        expose_headers=["X-Request-Id"],
    )

    @app.middleware("http")
    async def origin_check(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        """CSRF defence in depth (alongside SameSite=Lax): a browser request that changes state
        must come from one of our own origins. Requests without an Origin header (servers,
        CLI tools) aren't browser-driven and pass."""
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            origin = request.headers.get("origin")
            if origin and origin not in settings.cors_origin_list:
                return JSONResponse({"detail": {"code": "bad_origin"}}, status_code=403)
        return await call_next(request)

    @app.middleware("http")
    async def request_id(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response

    install_error_handlers(app)
    for r in (
        health.router,
        auth.router,
        me.router,
        learn.router,
        progress.router,
        sessions.router,
        history.router,
        resume.router,
        internal.router,
        work.router,
    ):
        app.include_router(r)
    app.router.routes.append(Route("/api/mcp", endpoint=McpEndpoint(), methods=["GET", "POST", "DELETE"]))
    return app


app = create_app()

"""One error shape for the whole API: {"detail": {"code": "<snake_case>"}}.

The frontend maps each code to friendly copy (frontend/src/lib/errors.ts), so raw
messages and stack traces never reach users.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("mockroom.api")


class AppError(Exception):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(code)
        self.status = status
        self.code = code


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(_req: Request, exc: AppError) -> JSONResponse:
        return JSONResponse({"detail": {"code": exc.code}}, status_code=exc.status)

    from app.work import WorkError  # local: keep errors.py importable without the domain

    @app.exception_handler(WorkError)
    async def work_error(_req: Request, exc: WorkError) -> JSONResponse:
        # Rule messages say how to fix things; they're safe to show and the UI does.
        return JSONResponse({"detail": {"code": exc.code, "message": exc.message}}, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_req: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [".".join(str(p) for p in e["loc"][1:]) for e in exc.errors()]
        return JSONResponse({"detail": {"code": "bad_request", "fields": fields}}, status_code=422)

    @app.exception_handler(Exception)
    async def unexpected(req: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error on %s %s", req.method, req.url.path)
        return JSONResponse({"detail": {"code": "upstream"}}, status_code=500)

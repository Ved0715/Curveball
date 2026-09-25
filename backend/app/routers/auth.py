"""Sign up, log in, log out, and who am I."""

from typing import Annotated

from fastapi import APIRouter, Cookie, Request, Response, status

from app import auth
from app.deps import CurrentUser, Db
from app.errors import AppError
from app.models import User
from app.repo import iso
from app.schemas import LoginIn, SignupIn, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_out(u: User) -> UserOut:
    return UserOut(
        id=str(u.id), email=u.email, name=u.name, timezone=u.timezone, created_at=iso(u.created_at)
    )


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() or (request.client.host if request.client else "unknown")


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(body: SignupIn, request: Request, response: Response, db: Db) -> UserOut:
    if not auth.signup_limiter.allow(_client_ip(request)):
        raise AppError(429, "too_many_attempts")
    if await auth.find_user(db, body.email):
        raise AppError(409, "email_taken")
    user = await auth.create_user(db, body.email, body.password, body.name, body.timezone)
    await auth.start_session(db, user, request.headers.get("user-agent", ""), response)
    return user_out(user)


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response, db: Db) -> UserOut:
    key = f"{_client_ip(request)}|{auth.normalize_email(body.email)}"
    if not auth.login_limiter.allow(key):
        raise AppError(429, "too_many_attempts")
    user = await auth.authenticate(db, body.email, body.password)
    if user is None:
        raise AppError(401, "bad_credentials")
    await auth.start_session(db, user, request.headers.get("user-agent", ""), response)
    return user_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(db: Db, response: Response, cb_session: Annotated[str | None, Cookie()] = None) -> Response:
    if cb_session:
        await auth.end_session(db, cb_session)
    out = Response(status_code=status.HTTP_204_NO_CONTENT)
    auth.clear_cookie(out)
    return out


@router.get("/me")
async def me(user: CurrentUser) -> UserOut:
    return user_out(user)

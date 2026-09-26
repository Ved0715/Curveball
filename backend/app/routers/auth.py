"""Sign up, log in, log out, and who am I."""

import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Cookie, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.exc import IntegrityError

from app import auth, google_oauth
from app.config import get_settings
from app.deps import CurrentUser, Db
from app.errors import AppError
from app.models import User
from app.repo import iso
from app.schemas import LoginIn, SignupIn, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])
log = logging.getLogger(__name__)


def user_out(u: User) -> UserOut:
    return UserOut(
        id=str(u.id),
        email=u.email,
        name=u.name,
        timezone=u.timezone,
        created_at=iso(u.created_at),
        has_password=u.password_hash is not None,
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
    try:
        user = await auth.create_user(db, body.email, body.password, body.name, body.timezone)
    except IntegrityError as e:  # two signups for the same email raced past the check above
        await db.rollback()
        raise AppError(409, "email_taken") from e
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


# ---------- Sign in with Google ----------


def _safe_next(path: str | None) -> str:
    """Only same-site paths: never bounce to another origin after signing in."""
    if path and path.startswith("/") and not path.startswith(("//", "/\\")):
        return path[:500]
    return "/today"


def _to_login(error: str) -> RedirectResponse:
    out = RedirectResponse(f"/login?error={error}", status_code=status.HTTP_302_FOUND)
    out.delete_cookie(google_oauth.STATE_COOKIE, path="/api/auth/google")
    return out


@router.get("/providers")
async def providers() -> dict[str, bool]:
    """Which sign-in buttons the login page should show."""
    return {"google": get_settings().google_enabled}


@router.get("/google/start")
async def google_start(request: Request, next: str | None = None, tz: str = "") -> Response:
    s = get_settings()
    if not s.google_enabled:
        return _to_login("google_unavailable")
    if not auth.login_limiter.allow(f"{_client_ip(request)}|google"):
        return _to_login("too_many_attempts")
    flow = google_oauth.new_flow()
    out = RedirectResponse(google_oauth.authorize_url(flow), status_code=status.HTTP_302_FOUND)
    out.set_cookie(
        google_oauth.STATE_COOKIE,
        google_oauth.pack_state(flow, _safe_next(next), tz),
        max_age=google_oauth.STATE_MAX_AGE,
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",  # sent on Google's top-level redirect back to us
        path="/api/auth/google",
    )
    return out


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: Db,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    cb_oauth: Annotated[str | None, Cookie()] = None,
) -> Response:
    if error:  # the user closed the Google screen or said no
        return _to_login("google_cancelled")
    try:
        saved = google_oauth.unpack_state(cb_oauth)
        if not code or not state or not secrets.compare_digest(state, saved["s"]):
            raise google_oauth.OAuthError("state mismatch")
        ident = await google_oauth.exchange_code(code, saved["v"])
    except google_oauth.OAuthError as e:
        log.warning("google sign-in failed: %s", e)
        return _to_login("google_failed")
    if not ident.email_verified:
        return _to_login("google_unverified")
    try:
        user = await auth.user_for_google(db, ident.sub, ident.email, ident.name, saved["tz"])
    except IntegrityError:  # two callbacks for a brand-new account raced; try once more
        await db.rollback()
        user = await auth.user_for_google(db, ident.sub, ident.email, ident.name, saved["tz"])
    out = RedirectResponse(_safe_next(saved["n"]), status_code=status.HTTP_302_FOUND)
    out.delete_cookie(google_oauth.STATE_COOKIE, path="/api/auth/google")
    await auth.start_session(db, user, request.headers.get("user-agent", ""), out)
    return out

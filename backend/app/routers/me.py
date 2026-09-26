"""The signed-in user's own account."""

from fastapi import APIRouter, Response, status

from app import auth, repo
from app.deps import CurrentUser, Db
from app.errors import AppError
from app.routers.auth import user_out
from app.schemas import PasswordChange, ProfileUpdate, UserOut

router = APIRouter(prefix="/api/me", tags=["me"])


@router.patch("")
async def update_profile(body: ProfileUpdate, db: Db, user: CurrentUser) -> UserOut:
    if body.timezone is not None:
        if not auth.valid_timezone(body.timezone):
            raise AppError(422, "bad_timezone")
        user.timezone = body.timezone
    if body.name is not None:
        user.name = body.name.strip()
    await db.commit()
    return user_out(user)


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(body: PasswordChange, db: Db, user: CurrentUser) -> Response:
    # A Google-only account has no password yet, so there's nothing to confirm.
    if user.password_hash is not None and not await auth.verify_password_async(
        user.password_hash, body.current
    ):
        raise AppError(401, "bad_credentials")
    user.password_hash = await auth.hash_password_async(body.new)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(db: Db, user: CurrentUser) -> Response:
    """Delete the account and everything it owns: learning log, interviews, resume, usage, sessions."""
    await repo.delete_user(db, user)
    out = Response(status_code=status.HTTP_204_NO_CONTENT)
    auth.clear_cookie(out)
    return out

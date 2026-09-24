from fastapi import APIRouter, Response, status

from app import repo
from app.deps import CurrentUser, Db

router = APIRouter(prefix="/api/me", tags=["me"])


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_data(db: Db, user: CurrentUser) -> Response:
    """Delete the user and everything they own: sessions, transcripts, reports, resume, usage."""
    await repo.delete_user(db, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

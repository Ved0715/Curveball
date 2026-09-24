from fastapi import APIRouter

from app import repo
from app.deps import CurrentUser, Db
from app.schemas import HistoryItem

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
async def history(db: Db, user: CurrentUser) -> list[HistoryItem]:
    return [HistoryItem.model_validate(h) for h in await repo.history(db, user)]

from fastapi import APIRouter, UploadFile

from app.config import get_settings
from app.errors import AppError
from app.resume import ResumeParseError, extract_text

router = APIRouter(prefix="/api/resume", tags=["resume"])


@router.post("")
async def parse_resume(file: UploadFile) -> dict[str, str]:
    """Extract text from a PDF/DOCX/TXT resume. Nothing is stored; the text is returned to the form."""
    limit = get_settings().max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise AppError(413, "file_too_large")
    try:
        text = extract_text(file.filename or "", data)
    except ResumeParseError as e:
        raise AppError(422, f"resume_{e}") from e
    return {"text": text}

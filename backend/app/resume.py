"""Extract plain text from an uploaded resume (PDF, DOCX, TXT, MD)."""

import io
import re

from docx import Document
from pypdf import PdfReader


class ResumeParseError(Exception):
    pass


def _clean(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text(filename: str, data: bytes) -> str:
    name = filename.lower()
    try:
        if name.endswith(".pdf"):
            reader = PdfReader(io.BytesIO(data))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        elif name.endswith(".docx"):
            doc = Document(io.BytesIO(data))
            text = "\n".join(p.text for p in doc.paragraphs)
        elif name.endswith((".txt", ".md")):
            text = data.decode("utf-8", errors="replace")
        else:
            raise ResumeParseError("unsupported")
    except ResumeParseError:
        raise
    except Exception as e:  # malformed files raise many different exception types
        raise ResumeParseError("unreadable") from e
    text = _clean(text)
    if not text:
        raise ResumeParseError("empty")  # e.g. a scanned PDF with no text layer
    return text

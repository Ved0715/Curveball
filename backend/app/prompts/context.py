"""Shared prompt context: the candidate's setup, formatted the same way for every call."""

from app.config import get_settings
from app.schemas import Setup, Turn


def clip(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text[:limit] + "\n[…trimmed]" if len(text) > limit else text


def setup_context(setup: Setup) -> str:
    s = get_settings()
    return f"""ROLE: {setup.role}
COMPANY: {setup.company or "(not specified)"}
EXPERIENCE LEVEL: {setup.level}
INTERVIEW ROUND: {setup.round}

JOB DESCRIPTION:
{clip(setup.jd, s.max_chars_jd) or "(not provided)"}

CANDIDATE RESUME:
{clip(setup.resume, s.max_chars_resume) or "(not provided)"}"""


def transcript_text(transcript: list[Turn]) -> str:
    return "\n\n".join(
        ("INTERVIEWER: " if t.speaker == "interviewer" else "CANDIDATE: ") + t.text for t in transcript
    )


def clip_transcript(transcript: list[Turn]) -> str:
    """Trim from the start so the most recent turns are always kept."""
    text = transcript_text(transcript)
    limit = get_settings().max_chars_transcript
    return "[…earlier turns trimmed]\n\n" + text[-limit:] if len(text) > limit else text

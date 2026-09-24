"""Shared prompt context: the candidate's setup, formatted the same way for every call."""

from app.config import get_settings
from app.schemas import Setup, Turn


def clip(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text[:limit] + "\n[…trimmed]" if len(text) > limit else text


def setup_context(setup: Setup, profile: str | None = None, raw_resume: bool = True) -> str:
    """The candidate's context for a prompt.

    `profile` is the structured resume profile (see prompts/resume.py). Calls that need
    every detail (brief, report) get the profile *and* the raw resume; latency-sensitive
    calls (interviewer, hint) get only the compact profile when it exists.
    """
    s = get_settings()
    parts = [
        f"""ROLE: {setup.role}
COMPANY: {setup.company or "(not specified)"}
EXPERIENCE LEVEL: {setup.level}
INTERVIEW ROUND: {setup.round}

JOB DESCRIPTION:
{clip(setup.jd, s.max_chars_jd) or "(not provided)"}"""
    ]
    if profile:
        parts.append(
            f"CANDIDATE PROFILE (extracted from their resume; every fact is from the resume):\n{profile}"
        )
    if raw_resume or not profile:
        parts.append(f"CANDIDATE RESUME:\n{clip(setup.resume, s.max_chars_resume) or '(not provided)'}")
    return "\n\n".join(parts)


def transcript_text(transcript: list[Turn]) -> str:
    return "\n\n".join(
        ("INTERVIEWER: " if t.speaker == "interviewer" else "CANDIDATE: ") + t.text for t in transcript
    )


def clip_transcript(transcript: list[Turn]) -> str:
    """Trim from the start so the most recent turns are always kept."""
    text = transcript_text(transcript)
    limit = get_settings().max_chars_transcript
    return "[…earlier turns trimmed]\n\n" + text[-limit:] if len(text) > limit else text

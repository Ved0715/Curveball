"""Build each session's structured resume profile once, and share it with every prompt.

- Kicked off in the background when a session is created, so it's usually ready before
  the first prompt needs it.
- Brief and report wait for it (they're slow anyway); interviewer turns and hints never
  wait: they use the profile if it's ready, otherwise the raw resume.
- An unchanged resume is never re-extracted: the profile is reused by text hash.
- Failures are logged and swallowed. A missing profile degrades quality slightly; it
  never blocks an interview.
"""

import asyncio
import hashlib
import logging
import re
import uuid
from collections.abc import AsyncIterator
from typing import Any

from app import llm, repo
from app.config import get_settings
from app.db import get_sessionmaker
from app.llm import AIError, Finished, StreamEvent
from app.models import InterviewSession, Profile
from app.prompts.resume import ResumeProfile, ground, profile_text, resume_prompt
from app.streaming import Tally

log = logging.getLogger("mockroom.resume")

SYSTEM = "You extract structured facts from resumes. You never add information that isn't in the text."

_locks: dict[uuid.UUID, asyncio.Lock] = {}


def resume_hash(text: str) -> str:
    return hashlib.sha256(re.sub(r"\s+", " ", text.strip()).encode()).hexdigest()


def as_text(data: dict[str, Any] | None) -> str | None:
    """Stored profile → prompt text, or None if there's no usable profile."""
    if not data:
        return None
    try:
        return profile_text(ResumeProfile.model_validate(data))
    except ValueError:
        return None


async def _run(source: AsyncIterator[StreamEvent], tally: Tally) -> str:
    async for ev in source:
        if isinstance(ev, Finished):
            tally.add(ev)
            return ev.text
    raise AIError("upstream", "stream ended without a result")


async def extract(resume: str, tally: Tally) -> ResumeProfile:
    """One model call (plus one retry on invalid output), then grounding."""
    return (await extract_detailed(resume, tally))[1]


async def extract_detailed(resume: str, tally: Tally) -> tuple[ResumeProfile, ResumeProfile, int]:
    """Returns (model's raw profile, grounded profile, items dropped by grounding).

    The eval reads the raw profile to measure how often the model invents facts;
    the app only ever uses the grounded one."""
    s = get_settings()
    if s.ai_mock:
        mocked = mock_extract(resume)
        return mocked, mocked, 0
    prompt = resume_prompt(resume, s.max_chars_resume)
    for attempt in range(2):
        text = await _run(
            llm.stream("fast", SYSTEM, prompt, s.max_tokens_resume, schema=ResumeProfile), tally
        )
        try:
            raw = llm.validate(ResumeProfile, text)
        except AIError:
            if attempt == 0:
                continue
            raise
        grounded, dropped = ground(raw, resume)
        if dropped:
            log.info("resume grounding dropped %d ungrounded item(s)", dropped)
        return raw, grounded, dropped
    raise AIError("invalid_output")


async def ensure_profile(session_id: uuid.UUID, user_id: uuid.UUID) -> dict[str, Any] | None:
    """Return the session's profile, extracting it if needed. Safe to call concurrently."""
    lock = _locks.setdefault(session_id, asyncio.Lock())
    try:
        async with lock:
            return await _ensure(session_id, user_id)
    finally:
        if not lock.locked():
            _locks.pop(session_id, None)


async def _ensure(session_id: uuid.UUID, user_id: uuid.UUID) -> dict[str, Any] | None:
    maker = get_sessionmaker()
    async with maker() as db:
        s = await db.get(InterviewSession, session_id)
        if s is None or s.user_id != user_id:
            return None
        if s.resume_profile is not None:
            return s.resume_profile
        text = s.resume_text.strip()
        if not text:
            return None
        h = resume_hash(text)
        profile = await db.get(Profile, user_id)
        if profile and profile.resume_hash == h and profile.resume_structured:
            s.resume_profile = profile.resume_structured
            await db.commit()
            return s.resume_profile
        if await repo.calls_today(db, user_id) >= get_settings().max_ai_calls_per_day:
            return None

    # No DB connection is held while the model works.
    tally = Tally()
    try:
        data = (await extract(text, tally)).model_dump()
    except AIError as e:
        log.warning("resume extraction failed (%s); prompts will use the raw resume", e.code)
        return None
    except Exception:
        log.exception("resume extraction crashed; prompts will use the raw resume")
        return None
    finally:
        if tally.calls:
            async with maker() as db:
                await repo.record_usage(db, user_id, tally.tokens_in, tally.tokens_out, tally.calls)
                await db.commit()

    async with maker() as db:
        s = await db.get(InterviewSession, session_id)
        if s is None:
            return None
        s.resume_profile = data
        profile = await db.get(Profile, user_id)
        if profile and resume_hash(profile.resume_text) == h:
            profile.resume_structured = data
            profile.resume_hash = h
        await db.commit()
    return data


# ---------- Mock mode ----------

_KNOWN_SKILLS = [
    "Python", "Go", "Golang", "Java", "Kotlin", "TypeScript", "JavaScript", "React", "Next.js", "Node.js",
    "SQL", "Postgres", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Kafka", "Docker", "Kubernetes", "AWS",
    "GCP", "Azure", "Terraform", "FastAPI", "Django", "Flask", "Spring", "GraphQL", "gRPC", "Pandas",
    "PyTorch", "TensorFlow", "Excel", "Tableau", "Power BI", "Figma", "C++", "Rust", "Swift", "Linux",
]  # fmt: skip


def mock_extract(resume: str) -> ResumeProfile:
    """Deterministic, grounded, no AI: enough to exercise the UI and the pipeline."""
    first = next((ln.strip() for ln in resume.splitlines() if ln.strip()), "")
    lowered = f" {resume.lower()} "
    skills = [
        sk for sk in _KNOWN_SKILLS if re.search(r"(?<![a-z])" + re.escape(sk.lower()) + r"(?![a-z])", lowered)
    ]
    metrics = []
    for m in re.finditer(
        r"(\S+\s+){0,3}?(\d[\d,.]*\s?(%|x|ms|k|m|cr|crore|lakh|users|hrs|hours))", resume, re.I
    ):
        metrics.append({"value": m.group(2).strip(), "context": m.group(0).strip()[:60]})
    profile = ResumeProfile.model_validate(
        {
            "headline": first[:120],
            "years_experience": None,
            "experience": [],
            "projects": [],
            "skills": skills[:30],
            "metrics": metrics[:12],
            "education": [],
        }
    )
    return ground(profile, resume)[0]

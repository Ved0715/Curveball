"""Database tables (docs/PRODUCT_SPEC.md §5).

Every row belongs to a user, directly or through its session, and deletes cascade,
so deleting a user removes everything they own ("delete my data").
Change a table here, then create a migration: `uv run alembic revision --autogenerate -m "..."`.
"""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# JSONB on Postgres (indexable, compact), plain JSON on SQLite for tests.
JsonB = JSON().with_variant(JSONB(), "postgresql")

# Predictable constraint names so Alembic migrations stay stable.
NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


def _now() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class User(Base):
    """An account. Signs in with email + password, Google, or both (same verified email)."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)  # stored lower-cased
    # None for accounts created with Google that never set a password.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Google's stable account id ("sub" claim); set once the account is linked to Google.
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(80))
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")  # IANA name
    created_at: Mapped[datetime] = _now()

    profile: Mapped["Profile | None"] = relationship(back_populates="user", cascade="all, delete-orphan")
    sessions: Mapped[list["InterviewSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class AuthSession(Base):
    """A signed-in browser. The cookie holds a random token; only its SHA-256 is stored."""

    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = _now()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = _now()


class Profile(Base):
    __tablename__ = "profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    resume_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # Structured profile of the latest resume, and a hash of the text it came from, so an
    # unchanged resume is never re-extracted.
    resume_structured: Mapped[dict[str, Any] | None] = mapped_column(JsonB)
    resume_hash: Mapped[str | None] = mapped_column(String(64))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="profile")


class InterviewSession(Base):
    """One practice interview: its setup, state machine, and status."""

    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(200))
    company: Mapped[str] = mapped_column(String(200), default="")
    level: Mapped[str] = mapped_column(String(40))
    round: Mapped[str] = mapped_column(String(60))
    style: Mapped[str] = mapped_column(String(20))
    question_count: Mapped[int] = mapped_column(Integer)
    jd_text: Mapped[str] = mapped_column(Text, default="")
    resume_text: Mapped[str] = mapped_column(Text, default="")  # snapshot used for this interview
    resume_profile: Mapped[dict[str, Any] | None] = mapped_column(JsonB)  # extracted from resume_text
    interviewer: Mapped[str] = mapped_column(String(40))
    # setup → brief → live → done
    status: Mapped[str] = mapped_column(String(10), default="setup")
    main_asked: Mapped[int] = mapped_column(Integer, default=0)
    followup_used: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="sessions")
    brief: Mapped["Brief | None"] = relationship(cascade="all, delete-orphan", passive_deletes=True)
    report: Mapped["Report | None"] = relationship(cascade="all, delete-orphan", passive_deletes=True)
    turns: Mapped[list["Turn"]] = relationship(
        order_by="Turn.index", cascade="all, delete-orphan", passive_deletes=True
    )


class Brief(Base):
    __tablename__ = "briefs"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )
    content: Mapped[dict[str, Any]] = mapped_column(JsonB)
    sources: Mapped[list[Any] | None] = mapped_column(JsonB)  # Phase 3 web research
    created_at: Mapped[datetime] = _now()


class Turn(Base):
    __tablename__ = "turns"
    __table_args__ = (UniqueConstraint("session_id", "index"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), index=True)
    index: Mapped[int] = mapped_column(Integer)
    speaker: Mapped[str] = mapped_column(String(12))  # interviewer | candidate
    kind: Mapped[str | None] = mapped_column(String(10))  # question | followup | clarify | closing
    text: Mapped[str] = mapped_column(Text)
    answer_seconds: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = _now()


class Report(Base):
    __tablename__ = "reports"

    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), primary_key=True
    )
    overall: Mapped[int] = mapped_column(Integer)
    verdict: Mapped[str] = mapped_column(String(20))
    content: Mapped[dict[str, Any]] = mapped_column(JsonB)
    created_at: Mapped[datetime] = _now()


class Usage(Base):
    """Daily AI usage per user, for limits and billing later."""

    __tablename__ = "usage"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    calls: Mapped[int] = mapped_column(Integer, default=0)


# ---------- Learning (docs/Learning Log PRD.md §10) ----------


class Topic(Base):
    """The shared curriculum. Synced from app/curriculum.json at startup."""

    __tablename__ = "topics"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)  # e.g. "dsa-01"
    category: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(200))
    blurb: Mapped[str] = mapped_column(Text)
    explore: Mapped[list[str]] = mapped_column(JsonB)
    created_at: Mapped[datetime] = _now()


class Assignment(Base):
    """One user's topic for one calendar day: the core fact table every stat is derived from.
    Title, blurb and category are copied in so the record freezes what the user actually saw."""

    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("user_id", "date"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date)  # the user's local calendar date
    topic_id: Mapped[str | None] = mapped_column(ForeignKey("topics.id", ondelete="SET NULL"))
    category: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    blurb: Mapped[str] = mapped_column(Text, default="")
    explore: Mapped[list[str]] = mapped_column(JsonB, default=list)
    source: Mapped[str] = mapped_column(String(12), default="auto")  # auto | queue | interview
    completed: Mapped[bool] = mapped_column(default=False)
    assigned_at: Mapped[datetime] = _now()
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(Text)  # the user's reflection
    lesson: Mapped[dict[str, Any] | None] = mapped_column(JsonB)  # AI mini-lesson, cached
    check_done: Mapped[bool] = mapped_column(default=False)  # finished the lesson's self-check


class LearnPreferences(Base):
    __tablename__ = "learn_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    focus_areas: Mapped[list[str]] = mapped_column(JsonB)  # never empty
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class QueueItem(Base):
    """A topic the user wants to learn next. FIFO; consumed before the curriculum."""

    __tablename__ = "queue_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    blurb: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(12), default="manual")  # manual | interview
    session_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sessions.id", ondelete="SET NULL"))
    # Order in the queue (lower = sooner). Ties fall back to created_at, so new items go last.
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = _now()


class JobRun(Base):
    """Durable log of scheduled jobs, so an unattended failure is discoverable (PRD §14)."""

    __tablename__ = "job_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    job: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(12))  # ok | failed
    detail: Mapped[dict[str, Any]] = mapped_column(JsonB, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime] = _now()

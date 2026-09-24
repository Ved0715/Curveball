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
    """A person using the app. Until sign-in exists, a user is an anonymous browser (client_id)."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    client_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    name: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = _now()

    profile: Mapped["Profile | None"] = relationship(back_populates="user", cascade="all, delete-orphan")
    sessions: Mapped[list["InterviewSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


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

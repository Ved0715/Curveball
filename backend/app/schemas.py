"""Request shapes sent by the frontend. Model output shapes live next to each prompt."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

Level = Literal[
    "Intern / fresher",
    "Junior (1–3 yrs)",
    "Mid-level (3–6 yrs)",
    "Senior (6+ yrs)",
    "Lead / manager",
]
Round = Literal[
    "Mixed (like a real first round)",
    "Behavioral",
    "Technical concepts",
    "Coding (talk through your approach)",
    "System design",
    "HR and culture fit",
    "Product sense / case",
]
Style = Literal["Friendly", "Neutral", "Tough"]
TurnKind = Literal["question", "followup", "clarify", "closing"]


class Setup(BaseModel):
    role: str = Field(min_length=1, max_length=200)
    company: str = Field(default="", max_length=200)
    level: Level = "Junior (1–3 yrs)"
    round: Round = "Mixed (like a real first round)"
    style: Style = "Neutral"
    question_count: Literal[4, 7, 10] = 7
    jd: str = Field(default="", max_length=60000)
    resume: str = Field(default="", max_length=60000)


class Turn(BaseModel):
    speaker: Literal["interviewer", "candidate"]
    text: str = Field(max_length=20000)
    kind: TurnKind | None = None
    answer_seconds: int | None = None


class InterviewState(BaseModel):
    """The interview state machine. Owned by our code, never by the model."""

    main_asked: int = Field(default=0, ge=0)
    followup_used: bool = False
    done: bool = False


class TurnRequest(BaseModel):
    setup: Setup
    interviewer: str = Field(min_length=1, max_length=40)
    transcript: list[Turn] = Field(default_factory=list, max_length=80)
    state: InterviewState = Field(default_factory=InterviewState)


class ReportRequest(BaseModel):
    setup: Setup
    interviewer: str = Field(min_length=1, max_length=40)
    transcript: list[Turn] = Field(min_length=1, max_length=80)


# ---------- Session API ----------


class TurnIn(BaseModel):
    """Candidate's answer to the last question. Omit `answer` to (re)request the interviewer's turn."""

    answer: str | None = Field(default=None, max_length=20000)
    answer_seconds: int | None = Field(default=None, ge=0, le=36000)


class SessionOut(BaseModel):
    id: str
    setup: Setup
    interviewer: str
    status: Literal["setup", "brief", "live", "done"]
    state: InterviewState
    brief: dict[str, object] | None
    resume_profile: dict[str, object] | None
    turns: list[Turn]
    report: dict[str, object] | None
    created_at: str


class HistoryItem(BaseModel):
    id: str
    role: str
    company: str
    round: str
    level: str
    style: str
    interviewer: str
    date: str
    overall: int
    verdict: str


# ---------- Accounts ----------


def _trim(v: object) -> object:
    return v.strip() if isinstance(v, str) else v


class SignupIn(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

    _trim_email = field_validator("email", mode="before")(_trim)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=80)
    timezone: str = Field(default="Asia/Kolkata", max_length=64)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)

    _trim_email = field_validator("email", mode="before")(_trim)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    timezone: str
    created_at: str
    # False for Google-only accounts: Settings offers "set a password" instead of "change".
    has_password: bool


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    timezone: str | None = Field(default=None, max_length=64)


class PasswordChange(BaseModel):
    # Empty when a Google-only account sets its first password.
    current: str = Field(default="", max_length=128)
    new: str = Field(min_length=8, max_length=128)

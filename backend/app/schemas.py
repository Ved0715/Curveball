"""Request shapes sent by the frontend. Model output shapes live next to each prompt."""

from typing import Literal

from pydantic import BaseModel, Field

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


class HintRequest(BaseModel):
    setup: Setup
    question: str = Field(min_length=1, max_length=4000)


class ReportRequest(BaseModel):
    setup: Setup
    interviewer: str = Field(min_length=1, max_length=40)
    transcript: list[Turn] = Field(min_length=1, max_length=80)

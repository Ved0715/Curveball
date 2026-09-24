"""Scored report prompt (prototype: makeReport)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.prompts.context import clip_transcript, setup_context
from app.schemas import ReportRequest


def _clamp(value: object, low: int, high: int) -> int:
    try:
        n = round(float(value))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return low
    return max(low, min(high, n))


class Scores(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content: int = Field(alias="Content", description="1-10")
    structure: int = Field(alias="Structure", description="1-10")
    specificity: int = Field(alias="Specificity", description="1-10")
    communication: int = Field(alias="Communication", description="1-10")
    role_fit: int = Field(alias="Role fit", description="1-10")

    @field_validator("*", mode="before")
    @classmethod
    def clamp(cls, v: object) -> int:
        return _clamp(v, 1, 10)


class Fix(BaseModel):
    issue: str = Field(description="the problem")
    how: str = Field(description="a concrete fix")


class AnswerReview(BaseModel):
    question: str = Field(description="the main question, shortened")
    score: int = Field(description="1-10")
    worked: str = Field(description="what worked")
    missing: str = Field(description="what was missing or weak")
    better: str = Field(
        description="a stronger model answer in the candidate's own voice using their REAL resume "
        "experience, 90-150 words, STAR structure for behavioral questions"
    )

    @field_validator("score", mode="before")
    @classmethod
    def clamp_score(cls, v: object) -> int:
        return _clamp(v, 1, 10)


class Report(BaseModel):
    overall: int = Field(description="integer 0-100")
    verdict: Literal["Strong hire", "Hire", "Borderline", "Not yet"]
    summary: str = Field(description="2-3 sentences: your honest overall read, as you'd tell a friend")
    scores: Scores
    strengths: list[str] = Field(
        description="3 specific things they did well, quoting or pointing to moments"
    )
    fixes: list[Fix]
    answers: list[AnswerReview]
    drills: list[str] = Field(description="3 specific practice exercises for the next session")

    @field_validator("overall", mode="before")
    @classmethod
    def clamp_overall(cls, v: object) -> int:
        return _clamp(v, 0, 100)


def report_prompt(req: ReportRequest) -> str:
    return f"""You are a senior hiring manager and interview coach. Evaluate this mock interview honestly, like a real bar-raiser, not a cheerleader. Judge against the expectations for the stated experience level.

{setup_context(req.setup)}

INTERVIEW TRANSCRIPT (the interviewer was {req.interviewer}):
{clip_transcript(req.transcript)}

Scoring rules:
- Give the top 3 fixes, most impactful first.
- One entry in answers per main question (fold follow-ups into the same entry). Only include questions the candidate actually answered.
- A vague, generic or evasive answer must never score above 5/10. Very short answers score low; say so plainly.
- Sub-scores are 1-10. Overall is 0-100 and must be consistent with the answer scores.
- Model answers must use experiences that appear in the resume. If the resume is missing, write a clearly-marked template the candidate can fill with their own details."""

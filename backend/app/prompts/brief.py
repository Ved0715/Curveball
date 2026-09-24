"""Prep brief prompt (prototype: buildBrief)."""

from typing import Literal

from pydantic import BaseModel, Field

from app.prompts.context import setup_context
from app.schemas import Setup


class Company(BaseModel):
    summary: str = Field(description="2-3 sentences: what the company does and what it's like to work there")
    values: list[str] = Field(description="3-5 things they are known to look for in hires")
    confidence: Literal["high", "medium", "low"]


class Strength(BaseModel):
    point: str = Field(description="a strength that matches the role")
    evidence: str = Field(description="the specific resume item that proves it")


class Gap(BaseModel):
    point: str = Field(description="a likely concern the interviewer will have")
    how: str = Field(description="how to address it honestly in the interview")


class LikelyQuestion(BaseModel):
    q: str = Field(description="a question they are likely to ask in this round")
    why: str = Field(description="what they are really testing")
    tip: str = Field(
        description="how THIS candidate should answer, naming a specific experience from their resume"
    )


class Story(BaseModel):
    theme: str = Field(description="e.g. conflict, failure, ownership, ambiguity")
    use: str = Field(description="which experience from the resume to tell, in one line")


class Brief(BaseModel):
    company: Company
    focus: list[str] = Field(description="5 competencies this round will judge, short phrases")
    strengths: list[Strength]
    gaps: list[Gap]
    questions: list[LikelyQuestion]
    stories: list[Story]
    askThem: list[str] = Field(description="sharp questions the candidate can ask the interviewer")


def brief_prompt(setup: Setup, profile: str | None = None) -> str:
    return f"""You are an elite interview coach who has sat on hundreds of hiring panels. Build a focused, specific prep brief for this candidate. No generic filler: every point must tie to this role, this company and this candidate's actual resume.

{setup_context(setup, profile)}

Give 3-4 strengths, 2-3 gaps, 8 questions matched to the "{setup.round}" round, 4 stories and 4 askThem.
The company summary comes from your general knowledge; set confidence to reflect how sure you are.
If no company is given, describe the typical employer for this role and set confidence to "low".
If the resume is missing, say so in the evidence fields and base advice on the role."""

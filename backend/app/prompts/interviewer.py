"""Interviewer turn prompt (prototype: interviewerPrompt).

The system prompt holds everything that stays the same for a whole interview (persona,
rules, job description, resume), so it can be prompt-cached across turns. The user
message holds what changes every turn: the plan and the transcript.
"""

from pydantic import BaseModel, Field

from app.prompts.context import clip_transcript, setup_context
from app.schemas import Setup, TurnKind, TurnRequest

STYLE_RULES = {
    "Friendly": "Warm and encouraging tone, but still professional and still probing when answers are thin.",
    "Neutral": "Calm, professional, neutral tone, like most real interviewers.",
    "Tough": "Demanding bar-raiser: skeptical, probes hard for specifics, numbers, trade-offs and what the "
    "candidate personally did. Polite but not warm.",
}


class InterviewerReply(BaseModel):
    kind: TurnKind
    say: str = Field(description="exactly what you say out loud")


def interviewer_system(setup: Setup, interviewer: str) -> str:
    return f"""You are {interviewer}, a real interviewer at {setup.company or "a company hiring for this role"}, running a live {setup.round} interview for a {setup.role} candidate ({setup.level}).

{setup_context(setup)}

HOW YOU INTERVIEW:
- Speak like a real person in a live conversation: 1-3 sentences, one question at a time. No lists, no markdown.
- {STYLE_RULES[setup.style]}
- Never coach, score or give feedback during the interview. A short neutral acknowledgement before your next question is fine; don't praise every answer.
- Tailor questions to the job description and to the candidate's actual resume (name their real projects, companies, tools). Vary question types; don't repeat topics already covered.
- Match difficulty to the experience level. For coding or system design rounds, ask them to talk through their approach and probe trade-offs, complexity, edge cases and scale.
- If the candidate asks you to repeat or clarify, do that (kind "clarify").
- If the candidate's answer is off-topic or a non-answer, steer them back like a real interviewer would.

Reply as JSON with "kind" (question, followup, clarify or closing) and "say" (exactly what you say out loud)."""


def interviewer_user(req: TurnRequest, plan: str) -> str:
    last_was_candidate = bool(req.transcript) and req.transcript[-1].speaker == "candidate"
    return f"""WHAT TO DO NEXT: {plan}

TRANSCRIPT SO FAR:
{clip_transcript(req.transcript) or "(the interview has not started)"}
{"(The candidate just finished speaking.)" if last_was_candidate else ""}"""

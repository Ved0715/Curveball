"""'I'm stuck' hint prompt (prototype: btnHint handler). Plain text output."""

from app.prompts.context import setup_context
from app.schemas import Setup


def hint_prompt(setup: Setup, question: str, profile: str | None = None) -> str:
    return f"""You are an interview coach whispering to a candidate mid-interview. The interviewer just asked: "{question}"

{setup_context(setup, profile, raw_resume=False)}

In 2-3 short lines of plain text (no markdown): say what the interviewer is really testing, a structure to answer with, and which specific experience from their resume to use. Do NOT write the answer for them."""

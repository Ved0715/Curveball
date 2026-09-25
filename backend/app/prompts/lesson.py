"""'Teach me' mini-lesson for the day's topic: a 5-minute read plus a quick self-check."""

from pydantic import BaseModel, Field

TRACK_LABELS = {
    "dsa": "Data Structures & Algorithms",
    "system-design": "System Design",
    "lang-depth": "Language & Runtime Depth",
    "fundamentals": "CS Fundamentals",
    "real-world": "Real-World & Situational",
    "custom": "Your pick",
}


class Example(BaseModel):
    title: str = Field(description="a short name for the worked example or scenario")
    body: str = Field(description="the worked example, code walkthrough or scenario, 80-160 words")


class CheckQuestion(BaseModel):
    question: str = Field(description="a question that tests understanding, not recall of wording")
    answer: str = Field(description="the model answer, 1-3 sentences")


class Lesson(BaseModel):
    tldr: str = Field(description="one sentence: the single idea to remember")
    explanation: list[str] = Field(description="2-4 short paragraphs, plain language, building intuition")
    key_points: list[str] = Field(description="3-5 crisp takeaways")
    example: Example
    pitfalls: list[str] = Field(description="2-3 common mistakes or misconceptions")
    check: list[CheckQuestion] = Field(description="exactly 3 self-check questions")


def lesson_prompt(title: str, blurb: str, category: str, level_hint: str) -> str:
    situational = (
        "This is a real-world, situational topic: frame the explanation around a concrete workplace "
        "situation and what a strong senior engineer would actually do, including the trade-offs and "
        "how they would communicate it."
        if category == "real-world"
        else "Build intuition first, then precision. Prefer one concrete example over many abstract ones."
    )
    return f"""Teach this topic to {level_hint} in a focused 5-minute lesson.

TOPIC: {title}
WHY IT MATTERS: {blurb}
TRACK: {TRACK_LABELS.get(category, category)}

{situational}

Rules:
- Plain, friendly language. Short sentences. No filler, no motivational fluff.
- Code, if any, is short and in Python or pseudocode, inside the example body.
- Never include URLs or claim a specific article exists. You may name well-known books or concepts.
- The self-check questions must make the learner think (apply, compare, predict), not just repeat a definition."""

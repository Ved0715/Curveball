"""Canned AI responses for AI_MOCK=true: free, offline, deterministic.

Streams the same way as the real API so the UI behaves identically.
"""

import asyncio
import json
from collections.abc import AsyncIterator

from app.llm import Finished, StreamEvent, TextDelta
from app.prompts.brief import Brief
from app.prompts.report import Report
from app.schemas import Setup, Turn, TurnRequest

MOCK_QUESTIONS = [
    "Walk me through a project on your resume you're most proud of. What was your personal role?",
    "Tell me about a time you disagreed with a teammate. How did you handle it?",
    "How would you debug an API endpoint that suddenly got ten times slower?",
    "Describe a time you had to learn something new very quickly to deliver.",
    "What's a decision you made with incomplete information, and how did it turn out?",
    "How do you decide what to work on when everything feels urgent?",
    "Tell me about a mistake you made and what you changed afterwards.",
    "How would you explain a technical trade-off to a non-technical stakeholder?",
    "Why this role, and why now?",
    "Where do you want to grow over the next two years?",
]


async def _drip(text: str, chunk: int = 12, delay: float = 0.015) -> AsyncIterator[StreamEvent]:
    for i in range(0, len(text), chunk):
        await asyncio.sleep(delay)
        yield TextDelta(text[i : i + chunk])
    yield Finished(text)


def mock_brief(setup: Setup) -> AsyncIterator[StreamEvent]:
    company = setup.company or "a typical employer"
    brief = Brief.model_validate(
        {
            "company": {
                "summary": f"{company} hires {setup.role} candidates to ship reliable work with high ownership. "
                "This is mock data: set AI_MOCK=false and add an API key for a real brief.",
                "values": ["Ownership", "Clear communication", "Bias for action", "Customer focus"],
                "confidence": "low",
            },
            "focus": ["Problem solving", "Ownership", "Communication", "Technical depth", "Collaboration"],
            "strengths": [
                {"point": "Hands-on delivery", "evidence": "Projects listed on your resume"},
                {"point": "Learning speed", "evidence": "Range of tools you've picked up"},
                {"point": "Team collaboration", "evidence": "Cross-team work you describe"},
            ],
            "gaps": [
                {
                    "point": "Impact isn't quantified",
                    "how": "Prepare one number per project: users, time, money.",
                },
                {"point": "Limited scale experience", "how": "Explain how you'd approach scale, honestly."},
            ],
            "questions": [
                {
                    "q": q,
                    "why": "How you think and what you personally did.",
                    "tip": "Use STAR and end with a result.",
                }
                for q in MOCK_QUESTIONS[:8]
            ],
            "stories": [
                {"theme": "Ownership", "use": "The project you drove end to end."},
                {"theme": "Conflict", "use": "A disagreement on approach and how it resolved."},
                {"theme": "Failure", "use": "Something that broke and what you changed."},
                {"theme": "Ambiguity", "use": "A task with unclear requirements."},
            ],
            "askThem": [
                "What does success look like in the first 90 days?",
                "What's the hardest problem the team is working on right now?",
                "How are technical decisions made on the team?",
                "What do the strongest people on this team do differently?",
            ],
        }
    )
    return _drip(brief.model_dump_json(), chunk=60, delay=0.01)


def mock_turn(req: TurnRequest) -> AsyncIterator[StreamEvent]:
    n, k = req.setup.question_count, req.state.main_asked
    if not req.transcript:
        reply = {
            "kind": "question",
            "say": f"Hi, I'm {req.interviewer}, thanks for joining. {MOCK_QUESTIONS[0]}",
        }
    elif k >= n:
        reply = {"kind": "closing", "say": "That's everything from my side. Thanks for your time today."}
    elif not req.state.followup_used and k % 2 == 1:
        reply = {
            "kind": "followup",
            "say": "Can you put a number on the result? What changed because of your work?",
        }
    else:
        reply = {"kind": "question", "say": "Thanks. " + MOCK_QUESTIONS[k % len(MOCK_QUESTIONS)]}
    return _drip(json.dumps(reply), chunk=6, delay=0.02)


def mock_hint() -> AsyncIterator[StreamEvent]:
    return _drip(
        "They're testing ownership and clear thinking.\n"
        "Use STAR: situation in one line, then what YOU did, then a measurable result.\n"
        "Pick the strongest project from your resume."
    )


def _answers_by_main_question(transcript: list[Turn]) -> list[tuple[str, str]]:
    """Group candidate answers under their main question, folding follow-ups in."""
    groups: list[tuple[str, str]] = []
    for t in transcript:
        if t.speaker == "interviewer" and t.kind == "question":
            groups.append((t.text, ""))
        elif t.speaker == "candidate" and groups:
            q, a = groups[-1]
            groups[-1] = (q, f"{a} {t.text}".strip())
    return [(q, a) for q, a in groups if a]


def mock_report(transcript: list[Turn]) -> AsyncIterator[StreamEvent]:
    answers = [
        {
            "question": q[:80],
            "score": 4 if len(a.split()) < 25 else 7,
            "worked": "You answered the question directly.",
            "missing": "A concrete result with a number, and what you personally did.",
            "better": "In my last project I owned the checkout API. Latency had doubled after a release, so I "
            "profiled it, found an N+1 query, and batched it. P95 went from 900ms to 180ms, and I added a "
            "load test to CI so it couldn't regress.",
        }
        for q, a in _answers_by_main_question(transcript)
    ]
    scores = [4 if len(a.split()) < 25 else 7 for _, a in _answers_by_main_question(transcript)]
    avg = sum(scores) / max(1, len(scores))
    report = Report.model_validate(
        {
            "overall": round(avg * 10),
            "verdict": "Hire" if avg >= 7 else "Borderline" if avg >= 5 else "Not yet",
            "summary": "This is a mock report. Your structure is reasonable but results need numbers. "
            "Set AI_MOCK=false and add an API key for a real evaluation.",
            "scores": {"Content": 6, "Structure": 7, "Specificity": 4, "Communication": 7, "Role fit": 6},
            "strengths": ["Direct answers", "Calm tone", "Good project choice"],
            "fixes": [
                {"issue": "No numbers", "how": "End every story with a measurable result."},
                {"issue": "'We' instead of 'I'", "how": "Say exactly what you did."},
                {"issue": "Long setup", "how": "Keep the situation to one sentence."},
            ],
            "answers": answers,
            "drills": [
                "Rewrite your top 3 stories with one number each.",
                "Record a 90-second answer and cut it to 60.",
                "Practice saying 'I' for every action you took.",
            ],
        }
    )
    return _drip(report.model_dump_json(by_alias=True), chunk=80, delay=0.01)


def mock_lesson(title: str) -> AsyncIterator[StreamEvent]:
    from app.prompts.lesson import Lesson

    lesson = Lesson.model_validate(
        {
            "tldr": f"{title}: the one idea to remember (mock lesson).",
            "explanation": [
                "This is a mock lesson. Set AI_MOCK=false and add an API key for a real one.",
                "Real lessons build intuition first, then precision, with one concrete example.",
            ],
            "key_points": [
                "Start from the problem it solves",
                "Know the trade-off",
                "Recognise it in the wild",
            ],
            "example": {"title": "A small worked example", "body": "Walk through the idea on a tiny input."},
            "pitfalls": ["Memorising the definition without the why", "Ignoring the trade-offs"],
            "check": [
                {"question": "What problem does this solve?", "answer": "The problem named in the topic."},
                {
                    "question": "When would you not use it?",
                    "answer": "When its trade-off costs more than it saves.",
                },
                {
                    "question": "How would you explain it to a teammate?",
                    "answer": "In one sentence plus an example.",
                },
            ],
        }
    )
    return _drip(lesson.model_dump_json(), chunk=80, delay=0.01)

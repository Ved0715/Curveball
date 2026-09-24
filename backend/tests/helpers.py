import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi.testclient import TestClient

from app.llm import Finished, StreamEvent, TextDelta

SETUP = {
    "role": "Backend Engineer",
    "company": "Razorpay",
    "question_count": 4,
    "resume": "Built a UPI reconciliation service in Go.",
}


def events(body: str) -> list[tuple[str, Any]]:
    out = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.split("\n"))
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def result(body: str) -> Any:
    evs = events(body)
    assert evs[-1][0] == "result", evs[-1]
    return evs[-1][1]


def create(client: TestClient, **overrides: Any) -> str:
    r = client.post("/api/sessions", json={**SETUP, **overrides})
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


def play_interview(
    client: TestClient, sid: str, answer: str = "I led it and cut latency by 40%."
) -> dict[str, Any]:
    """Answer every question until the interviewer closes. Returns the final turn result."""
    turn = result(client.post(f"/api/sessions/{sid}/turn", json={}).text)
    for _ in range(30):
        if turn["state"]["done"]:
            return dict(turn)
        body = {"answer": answer, "answer_seconds": 30}
        turn = result(client.post(f"/api/sessions/{sid}/turn", json=body).text)
    raise AssertionError("interview never finished")


def fake_stream(outputs: list[str]) -> Any:
    """Stand-in for llm.stream that returns the given raw model outputs, one per call."""
    calls = iter(outputs)

    async def stream(*_a: Any, **_k: Any) -> AsyncIterator[StreamEvent]:
        text = next(calls)
        if text == "RAISE":
            from app.llm import AIError

            raise AIError("overloaded")
        yield TextDelta(text)
        yield Finished(text, tokens_in=100, tokens_out=20)

    return stream

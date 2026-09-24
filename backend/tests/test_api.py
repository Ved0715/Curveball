import json
from collections.abc import AsyncIterator, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import llm
from app.config import get_settings
from app.llm import AIError, Finished, StreamEvent, TextDelta
from app.main import app

SETUP = {
    "role": "Backend Engineer",
    "company": "Razorpay",
    "question_count": 4,
    "resume": "Built a UPI service",
}


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(get_settings(), "ai_mock", True)
    with TestClient(app) as c:
        yield c


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


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json()["mock"] is True


def test_brief_streams_progress_then_result(client: TestClient) -> None:
    r = client.post("/api/brief", json=SETUP)
    evs = events(r.text)
    assert evs[0][0] == "progress"
    brief = result(r.text)
    assert len(brief["questions"]) == 8
    assert brief["company"]["confidence"] in ("high", "medium", "low")


def test_setup_is_validated(client: TestClient) -> None:
    assert client.post("/api/brief", json={"role": ""}).status_code == 422
    assert client.post("/api/brief", json={**SETUP, "question_count": 5}).status_code == 422


def test_full_interview_obeys_question_count(client: TestClient) -> None:
    transcript: list[dict[str, Any]] = []
    state = {"main_asked": 0, "followup_used": False, "done": False}
    for _ in range(20):
        r = client.post(
            "/api/interview/turn",
            json={"setup": SETUP, "interviewer": "Priya", "transcript": transcript, "state": state},
        )
        evs = events(r.text)
        assert any(name == "say" for name, _ in evs)
        turn = result(r.text)
        state = turn["state"]
        transcript.append({"speaker": "interviewer", "text": turn["say"], "kind": turn["kind"]})
        if state["done"]:
            break
        transcript.append({"speaker": "candidate", "text": "I led the migration and cut latency by 40%."})
    assert state["done"]
    assert state["main_asked"] == 4
    assert sum(1 for t in transcript if t.get("kind") == "question") == 4

    r = client.post("/api/report", json={"setup": SETUP, "interviewer": "Priya", "transcript": transcript})
    report = result(r.text)
    assert 0 <= report["overall"] <= 100
    assert set(report["scores"]) == {"Content", "Structure", "Specificity", "Communication", "Role fit"}
    assert len(report["answers"]) == 4


def test_turn_after_done_is_rejected(client: TestClient) -> None:
    body = {"setup": SETUP, "interviewer": "Priya", "state": {"main_asked": 4, "done": True}}
    assert client.post("/api/interview/turn", json=body).status_code == 409


def test_report_needs_an_answer(client: TestClient) -> None:
    body = {"setup": SETUP, "interviewer": "Priya", "transcript": [{"speaker": "interviewer", "text": "Hi"}]}
    assert client.post("/api/report", json=body).status_code == 422


def test_hint_streams_text(client: TestClient) -> None:
    r = client.post("/api/hint", json={"setup": SETUP, "question": "Tell me about yourself"})
    assert result(r.text)["text"]


def test_resume_upload_txt(client: TestClient) -> None:
    r = client.post("/api/resume", files={"file": ("cv.txt", b"Jane   Doe\n\n\n\nEngineer", "text/plain")})
    assert r.json() == {"text": "Jane Doe\n\nEngineer"}


def test_resume_upload_rejects_unknown_type(client: TestClient) -> None:
    r = client.post("/api/resume", files={"file": ("cv.exe", b"x", "application/octet-stream")})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "resume_unsupported"


def fake_stream(outputs: list[str]) -> Any:
    calls = iter(outputs)

    async def stream(*_a: Any, **_k: Any) -> AsyncIterator[StreamEvent]:
        text = next(calls)
        yield TextDelta(text)
        yield Finished(text)

    return stream


def test_invalid_output_is_retried_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "ai_mock", False)
    good = '{"kind":"question","say":"Hi, tell me about yourself."}'
    monkeypatch.setattr(llm, "stream", fake_stream(['{"kind":"oops"}', good]))
    with TestClient(app) as c:
        r = c.post("/api/interview/turn", json={"setup": SETUP, "interviewer": "Priya"})
    names = [n for n, _ in events(r.text)]
    assert "reset" in names
    assert result(r.text)["say"] == "Hi, tell me about yourself."


def test_invalid_output_twice_gives_clean_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "ai_mock", False)
    monkeypatch.setattr(llm, "stream", fake_stream(["nope", "still nope"]))
    with TestClient(app) as c:
        r = c.post("/api/interview/turn", json={"setup": SETUP, "interviewer": "Priya"})
    assert events(r.text)[-1] == ("error", {"code": "invalid_output", "retryable": True})


def test_early_closing_is_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "ai_mock", False)
    early = '{"kind":"closing","say":"Thanks, bye."}'
    good = '{"kind":"question","say":"What did you build?"}'
    monkeypatch.setattr(llm, "stream", fake_stream([early, good]))
    with TestClient(app) as c:
        r = c.post("/api/interview/turn", json={"setup": SETUP, "interviewer": "Priya"})
    assert result(r.text)["kind"] == "question"


def test_missing_api_key_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "ai_mock", False)
    monkeypatch.setattr(get_settings(), "anthropic_api_key", None)
    llm._client.cache_clear()
    with TestClient(app) as c:
        r = c.post("/api/hint", json={"setup": SETUP, "question": "Why us?"})
    assert events(r.text)[-1] == ("error", {"code": "not_configured", "retryable": False})


def test_ai_error_retryable_flags() -> None:
    assert AIError("rate_limited").retryable
    assert not AIError("refused").retryable

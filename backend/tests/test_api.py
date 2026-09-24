import pytest
from fastapi.testclient import TestClient

from app import llm
from app.config import get_settings
from app.main import app
from tests.conftest import CLIENT_B
from tests.helpers import SETUP, create, events, fake_stream, play_interview, result


def test_health_reports_db(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.json() == {"ok": True, "mock": True, "ai_configured": True, "db": True}
    assert r.headers["X-Request-Id"]


def test_requires_client_id() -> None:
    with TestClient(app) as c:
        r = c.post("/api/sessions", json=SETUP)
    assert r.status_code == 401
    assert r.json() == {"detail": {"code": "no_client"}}


def test_setup_is_validated(client: TestClient) -> None:
    r = client.post("/api/sessions", json={**SETUP, "role": ""})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "bad_request"
    assert client.post("/api/sessions", json={**SETUP, "question_count": 5}).status_code == 422


def test_create_and_get_session(client: TestClient) -> None:
    sid = create(client)
    s = client.get(f"/api/sessions/{sid}").json()
    assert s["setup"]["role"] == "Backend Engineer"
    assert s["status"] == "setup"
    assert s["interviewer"]
    assert s["turns"] == [] and s["brief"] is None and s["report"] is None


def test_brief_is_saved_and_idempotent(client: TestClient) -> None:
    sid = create(client)
    first = client.post(f"/api/sessions/{sid}/brief").text
    names = [n for n, _ in events(first)]
    assert names[:2] == ["stage", "stage"] and "progress" in names
    assert [d["stage"] for n, d in events(first) if n == "stage"] == ["resume", "writing"]
    brief = result(first)
    assert len(brief["questions"]) == 8
    s = client.get(f"/api/sessions/{sid}").json()
    assert s["brief"] == brief and s["status"] == "brief"
    again = client.post(f"/api/sessions/{sid}/brief").text
    assert events(again) == [("result", brief)]  # served from the DB, no AI call


def test_full_interview_report_and_history(client: TestClient) -> None:
    sid = create(client)
    final = play_interview(client, sid)
    assert final["kind"] == "closing"
    assert final["state"]["main_asked"] == 4 and final["state"]["done"]

    s = client.get(f"/api/sessions/{sid}").json()
    assert s["status"] == "done"
    assert sum(1 for t in s["turns"] if t.get("kind") == "question") == 4
    assert [t["speaker"] for t in s["turns"][:2]] == ["interviewer", "candidate"]
    assert s["turns"][1]["answer_seconds"] == 30

    assert client.post(f"/api/sessions/{sid}/turn", json={"answer": "more"}).status_code == 409

    report = result(client.post(f"/api/sessions/{sid}/report").text)
    assert 0 <= report["overall"] <= 100
    assert set(report["scores"]) == {"Content", "Structure", "Specificity", "Communication", "Role fit"}
    assert len(report["answers"]) == 4  # follow-ups fold into their main question
    assert client.get(f"/api/sessions/{sid}").json()["report"] == report

    hist = client.get("/api/history").json()
    assert [h["id"] for h in hist] == [sid]
    assert hist[0]["overall"] == report["overall"]


def test_turn_needs_an_answer_when_one_is_expected(client: TestClient) -> None:
    sid = create(client)
    result(client.post(f"/api/sessions/{sid}/turn", json={}).text)
    r = client.post(f"/api/sessions/{sid}/turn", json={})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "awaiting_answer"


def test_retry_after_failure_does_not_duplicate_the_answer(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sid = create(client)
    result(client.post(f"/api/sessions/{sid}/turn", json={}).text)

    monkeypatch.setattr(get_settings(), "ai_mock", False)
    good = '{"kind":"question","say":"What did you measure?"}'
    monkeypatch.setattr(llm, "stream", fake_stream(["RAISE", good]))
    failed = client.post(f"/api/sessions/{sid}/turn", json={"answer": "My answer"}).text
    assert events(failed)[-1] == ("error", {"code": "overloaded", "retryable": True})

    # The client retries, possibly re-sending the answer; it must be stored once.
    retried = result(client.post(f"/api/sessions/{sid}/turn", json={"answer": "My answer"}).text)
    assert retried["say"] == "What did you measure?"
    turns = client.get(f"/api/sessions/{sid}").json()["turns"]
    assert [t["speaker"] for t in turns] == ["interviewer", "candidate", "interviewer"]


def test_invalid_output_is_retried_once(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sid = create(client)
    monkeypatch.setattr(get_settings(), "ai_mock", False)
    good = '{"kind":"question","say":"Hi, tell me about yourself."}'
    monkeypatch.setattr(llm, "stream", fake_stream(['{"kind":"oops"}', good]))
    body = client.post(f"/api/sessions/{sid}/turn", json={}).text
    assert "reset" in [n for n, _ in events(body)]
    assert result(body)["say"] == "Hi, tell me about yourself."


def test_invalid_output_twice_gives_clean_error(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sid = create(client)
    monkeypatch.setattr(get_settings(), "ai_mock", False)
    monkeypatch.setattr(llm, "stream", fake_stream(["nope", "still nope"]))
    body = client.post(f"/api/sessions/{sid}/turn", json={}).text
    assert events(body)[-1] == ("error", {"code": "invalid_output", "retryable": True})
    assert client.get(f"/api/sessions/{sid}").json()["turns"] == []


def test_early_closing_is_retried(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sid = create(client)
    monkeypatch.setattr(get_settings(), "ai_mock", False)
    early = '{"kind":"closing","say":"Thanks, bye."}'
    good = '{"kind":"question","say":"What did you build?"}'
    monkeypatch.setattr(llm, "stream", fake_stream([early, good]))
    assert result(client.post(f"/api/sessions/{sid}/turn", json={}).text)["kind"] == "question"


def test_usage_is_recorded(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sid = create(client)
    monkeypatch.setattr(get_settings(), "ai_mock", False)
    good = '{"kind":"question","say":"Hello."}'
    monkeypatch.setattr(llm, "stream", fake_stream(['{"bad":1}', good]))
    result(client.post(f"/api/sessions/{sid}/turn", json={}).text)
    monkeypatch.setattr(get_settings(), "max_ai_calls_per_day", 2)
    # Both attempts were counted (retries cost too), so the cap of 2 is reached.
    assert client.post(f"/api/sessions/{sid}/hint").status_code == 429


def test_end_early(client: TestClient) -> None:
    sid = create(client)
    result(client.post(f"/api/sessions/{sid}/turn", json={}).text)
    r = client.post(f"/api/sessions/{sid}/end")
    assert r.status_code == 422 and r.json()["detail"]["code"] == "nothing_to_score"

    result(client.post(f"/api/sessions/{sid}/turn", json={"answer": "An answer"}).text)
    s = client.post(f"/api/sessions/{sid}/end").json()
    assert s["status"] == "done" and s["state"]["done"]
    assert s["turns"][-1]["kind"] == "closing"
    assert len(result(client.post(f"/api/sessions/{sid}/report").text)["answers"]) == 1


def test_report_before_the_end_is_rejected(client: TestClient) -> None:
    sid = create(client)
    result(client.post(f"/api/sessions/{sid}/turn", json={}).text)
    r = client.post(f"/api/sessions/{sid}/report")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "interview_not_finished"


def test_hint(client: TestClient) -> None:
    sid = create(client)
    assert client.post(f"/api/sessions/{sid}/hint").status_code == 409
    result(client.post(f"/api/sessions/{sid}/turn", json={}).text)
    assert result(client.post(f"/api/sessions/{sid}/hint").text)["text"]


def test_sessions_are_private(client: TestClient) -> None:
    sid = create(client)
    other = {"X-Client-Id": CLIENT_B}
    assert client.get(f"/api/sessions/{sid}", headers=other).status_code == 404
    assert client.post(f"/api/sessions/{sid}/turn", json={}, headers=other).status_code == 404
    client.delete(f"/api/sessions/{sid}", headers=other)
    assert client.get("/api/history", headers=other).json() == []
    assert client.get(f"/api/sessions/{sid}").status_code == 200


def test_delete_session_and_delete_my_data(client: TestClient) -> None:
    keep, drop = create(client), create(client)
    assert client.delete(f"/api/sessions/{drop}").status_code == 204
    assert client.get(f"/api/sessions/{drop}").status_code == 404
    play_interview(client, keep)
    result(client.post(f"/api/sessions/{keep}/report").text)

    assert client.delete("/api/me").status_code == 204
    assert client.get(f"/api/sessions/{keep}").status_code == 404
    assert client.get("/api/history").json() == []


def test_daily_ai_limit(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sid = create(client)
    monkeypatch.setattr(get_settings(), "max_ai_calls_per_day", 1)
    result(client.post(f"/api/sessions/{sid}/brief").text)
    r = client.post(f"/api/sessions/{sid}/turn", json={})
    assert r.status_code == 429 and r.json()["detail"]["code"] == "daily_limit"
    # Already-built results are still free to fetch.
    assert result(client.post(f"/api/sessions/{sid}/brief").text)


def test_missing_api_key_is_reported(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sid = create(client)
    monkeypatch.setattr(get_settings(), "ai_mock", False)
    monkeypatch.setattr(get_settings(), "anthropic_api_key", None)
    body = client.post(f"/api/sessions/{sid}/turn", json={}).text
    assert events(body)[-1] == ("error", {"code": "not_configured", "retryable": False})


def test_resume_upload(client: TestClient) -> None:
    r = client.post("/api/resume", files={"file": ("cv.txt", b"Jane   Doe\n\n\n\nEngineer", "text/plain")})
    assert r.json() == {"text": "Jane Doe\n\nEngineer"}
    r = client.post("/api/resume", files={"file": ("cv.exe", b"x", "application/octet-stream")})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "resume_unsupported"


def test_ai_error_retryable_flags() -> None:
    assert llm.AIError("rate_limited").retryable
    assert not llm.AIError("refused").retryable

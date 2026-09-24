from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import llm, resume_profile
from app.config import get_settings
from app.llm import AIError
from app.prompts.resume import Metric, Project, ResumeProfile, Role, ground, profile_text
from tests.helpers import create, events, fake_stream, result

RESUME = """Asha Rao — Backend Engineer
Razorpay, Software Engineer II (2022 – Present)
- Built the UPI reconciliation service in Go; cut p95 latency by 40%.
- Scaled settlement jobs to 2M transactions/day.
Projects: LedgerLite — double-entry ledger in Python and Postgres.
Skills: Go, Python, Postgres, Kafka
"""


def profile(**over: Any) -> ResumeProfile:
    base: dict[str, Any] = {
        "headline": "Backend engineer, payments",
        "years_experience": 3,
        "experience": [
            Role(company="Razorpay", title="Software Engineer II", period="2022 – Present", highlights=[])
        ],
        "projects": [Project(name="LedgerLite", summary="ledger", tech=["Python"], impact="")],
        "skills": ["Go", "Python", "Kafka"],
        "metrics": [Metric(value="40%", context="p95 latency cut"), Metric(value="2M", context="txns/day")],
        "education": [],
    }
    return ResumeProfile.model_validate({**base, **over})


def test_grounding_keeps_real_facts() -> None:
    grounded, dropped = ground(profile(), RESUME)
    assert dropped == 0
    assert [m.value for m in grounded.metrics] == ["40%", "2M"]


def test_grounding_drops_invented_facts() -> None:
    invented = profile(
        experience=[Role(company="Google", title="SWE", period="", highlights=[])],
        projects=[Project(name="MagicCache", summary="x", tech=[], impact="")],
        skills=["Go", "Rust"],
        metrics=[Metric(value="40%", context="real"), Metric(value="75%", context="made up")],
    )
    grounded, dropped = ground(invented, RESUME)
    assert dropped == 4
    assert grounded.experience == [] and grounded.projects == []
    assert grounded.skills == ["Go"]
    assert [m.value for m in grounded.metrics] == ["40%"]


def test_profile_text_is_compact_and_stable() -> None:
    text = profile_text(profile())
    assert "Software Engineer II, Razorpay (2022 – Present)" in text
    assert "40% (p95 latency cut)" in text
    assert text == profile_text(profile())


def test_profile_is_built_on_create(client: TestClient) -> None:
    sid = create(client, resume=RESUME)
    p = client.get(f"/api/sessions/{sid}").json()["resume_profile"]
    assert p is not None
    assert {"Go", "Python", "Postgres", "Kafka"} <= set(p["skills"])
    assert any(m["value"].startswith("40") for m in p["metrics"])


def test_no_resume_means_no_profile(client: TestClient) -> None:
    sid = create(client, resume="")
    assert client.get(f"/api/sessions/{sid}").json()["resume_profile"] is None
    stages = [d["stage"] for n, d in events(client.post(f"/api/sessions/{sid}/brief").text) if n == "stage"]
    assert stages == ["writing"]


def test_same_resume_is_not_extracted_twice(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    create(client, resume=RESUME)

    async def boom(*_a: Any, **_k: Any) -> ResumeProfile:
        raise AssertionError("should reuse the saved profile")

    monkeypatch.setattr(resume_profile, "extract", boom)
    sid2 = create(client, resume=RESUME)
    assert client.get(f"/api/sessions/{sid2}").json()["resume_profile"] is not None


def test_extraction_failure_never_blocks(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fail(*_a: Any, **_k: Any) -> ResumeProfile:
        raise AIError("overloaded")

    monkeypatch.setattr(resume_profile, "extract", fail)
    sid = create(client, resume=RESUME)
    assert client.get(f"/api/sessions/{sid}").json()["resume_profile"] is None
    assert result(client.post(f"/api/sessions/{sid}/brief").text)["questions"]


def test_turns_use_the_compact_profile(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    sid = create(client, resume=RESUME)  # profile built in mock mode
    seen: list[str] = []
    stream = fake_stream(['{"kind":"question","say":"Tell me about LedgerLite."}'])

    def spy(tier: str, system: str, *a: Any, **k: Any) -> Any:
        seen.append(system)
        return stream(tier, system, *a, **k)

    monkeypatch.setattr(get_settings(), "ai_mock", False)
    monkeypatch.setattr(llm, "stream", spy)
    result(client.post(f"/api/sessions/{sid}/turn", json={}).text)
    assert "CANDIDATE PROFILE" in seen[0]
    assert "CANDIDATE RESUME" not in seen[0]


def test_real_extraction_path_grounds_model_output(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    invented = profile(metrics=[Metric(value="40%", context="real"), Metric(value="99%", context="invented")])
    monkeypatch.setattr(get_settings(), "ai_mock", False)
    monkeypatch.setattr(llm, "stream", fake_stream([invented.model_dump_json()]))
    sid = create(client, resume=RESUME)
    p = client.get(f"/api/sessions/{sid}").json()["resume_profile"]
    assert [m["value"] for m in p["metrics"]] == ["40%"]

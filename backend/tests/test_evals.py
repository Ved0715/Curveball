"""The graders are tested with no model calls: an oracle report must pass every check,
and reports that break the rules must fail the right check."""

import asyncio
from typing import Any

import pytest

from app.config import get_settings
from app.prompts.resume import Metric, Project, ResumeProfile, Role
from evals.grade import (
    ReportCase,
    cross_checks,
    grade_report,
    grade_resume,
    load_report_cases,
    load_resume_cases,
)
from evals.run import run_report_case, wilson

CASES, META = load_report_cases()
BY_ID = {c.id: c for c in CASES}


def oracle(case: ReportCase) -> dict[str, Any]:
    """A report that meets every expectation of the case."""
    exp = case.expect
    answers = []
    for i in range(case.main_questions):
        band = exp["answers"][i] if i < len(exp["answers"]) else {}
        score = band.get("min", band.get("max", 5))
        answers.append(
            {
                "question": f"Q{i + 1}",
                "score": score,
                "worked": "w",
                "missing": "m",
                "better": f"At {exp['anchors'][0]}, I…",
            }
        )
    lo, hi = exp["overall"]
    return {"overall": (lo + hi) // 2, "verdict": exp["verdict_in"][0], "answers": answers}


def test_cases_are_well_formed() -> None:
    assert len(CASES) >= 10
    assert len({c.id for c in CASES}) == len(CASES)
    for c in CASES:
        assert len(c.expect["answers"]) == c.main_questions, c.id
        assert c.transcript[-1].kind == "closing", c.id
        lo, hi = c.expect["overall"]
        assert 0 <= lo <= hi <= 100, c.id
        assert c.expect["anchors"], c.id


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.id)
def test_oracle_passes_every_check(case: ReportCase) -> None:
    g = grade_report(case, oracle(case))
    assert {k: v for k, v in g.scores.items() if k != "overall"} == {
        "honest": 1.0,
        "overall_band": 1.0,
        "answer_count": 1.0,
        "grounded": 1.0,
    }, g.explanation


def test_vague_answer_scored_high_fails_honesty() -> None:
    case = BY_ID["weak-vague"]
    report = oracle(case)
    report["answers"][1]["score"] = 7
    g = grade_report(case, report)
    assert g.scores["honest"] == 0.0
    assert "Q2: 7 > max 5" in g.explanation["honest"]


def test_strong_answer_scored_low_fails_honesty() -> None:
    case = BY_ID["strong-senior"]
    report = oracle(case)
    report["answers"][0]["score"] = 5
    assert grade_report(case, report).scores["honest"] == 0.0


def test_overall_verdict_count_and_grounding_checks() -> None:
    case = BY_ID["followups-fold"]
    report = oracle(case)
    report["answers"].append(dict(report["answers"][0]))  # follow-up scored as its own entry
    report["overall"] = 99
    report["verdict"] = "Strong hire"
    report["answers"][0]["better"] = "I would be a great fit and work hard."
    g = grade_report(case, report)
    assert g.scores["answer_count"] == 0.0
    assert g.scores["overall_band"] == 0.0
    assert g.scores["grounded"] == 0.0


def test_calibration_and_consistency_cross_checks() -> None:
    ok = cross_checks(
        {
            "calibration-fresher-level": [72, 70, 74],
            "calibration-senior-level": [50, 55, 52],
            "strong-senior": [85, 86, 84],
        },
        META,
    )
    assert all(c["pass"] for c in ok), ok
    bad = cross_checks(
        {"calibration-fresher-level": [60, 60], "calibration-senior-level": [58, 59], "evasive": [5, 40]},
        META,
    )
    by_id = {c["id"]: c for c in bad}
    assert by_id["level-calibration"]["pass"] is False
    assert by_id["consistency"]["pass"] is False


def test_resume_grader_catches_invention_and_misses() -> None:
    case = next(c for c in load_resume_cases() if c.id == "asha-backend")
    raw = ResumeProfile(
        headline="h",
        years_experience=3,
        experience=[Role(company="Razorpay", title="SE II", period="", highlights=[])],
        projects=[Project(name="LedgerLite", summary="s", tech=[], impact="")],
        skills=["Go", "Kafka", "Postgres", "Rust"],
        metrics=[Metric(value="40%", context="latency"), Metric(value="2M", context="txns/day")],
        education=[],
    )
    grounded = raw.model_copy(update={"skills": ["Go", "Kafka", "Postgres"]})
    g = grade_resume(case, raw, grounded, dropped=1)
    assert g.scores["precision"] == pytest.approx(7 / 8)
    assert g.scores["recall"] < 1.0
    assert "company 'Swiggy'" in g.explanation["recall"]
    assert "metric '120 ms'" in g.explanation["recall"]


def test_wilson_interval() -> None:
    assert wilson(0, 0) == (0.0, 0.0)
    lo, hi = wilson(9, 10)
    assert 0.55 < lo < 0.9 < hi <= 1.0


def test_runner_wiring_in_mock_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "ai_mock", True)
    out = asyncio.run(run_report_case(BY_ID["mixed-strong-and-vague"]))
    assert set(out.grade.scores) == {"honest", "overall_band", "answer_count", "grounded", "overall"}
    assert [t["role"] for t in out.trace] == ["system", "user", "assistant"]
    assert "CANDIDATE PROFILE" in out.trace[1]["content"]

import anthropic
import pytest

from app.config import get_settings
from app.llm import _request_kwargs
from app.prompts.brief import Brief
from app.prompts.interviewer import InterviewerReply
from app.prompts.report import Report


def test_schemas_convert_for_structured_outputs() -> None:
    for model in (Brief, InterviewerReply, Report):
        schema = anthropic.transform_schema(model)
        assert schema["additionalProperties"] is False


def test_report_uses_display_names_for_scores() -> None:
    schema = anthropic.transform_schema(Report)
    scores = schema["$defs"]["Scores"]["properties"]
    assert "Role fit" in scores


def test_report_clamps_out_of_range_numbers() -> None:
    r = Report.model_validate(
        {
            "overall": 140,
            "verdict": "Hire",
            "summary": "s",
            "scores": {
                "Content": 0,
                "Structure": 12,
                "Specificity": 5,
                "Communication": "7",
                "Role fit": 6.6,
            },
            "strengths": [],
            "fixes": [],
            "answers": [{"question": "q", "score": 99, "worked": "w", "missing": "m", "better": "b"}],
            "drills": [],
        }
    )
    assert r.overall == 100
    assert (r.scores.content, r.scores.structure, r.scores.role_fit) == (1, 10, 7)
    assert r.answers[0].score == 10


def test_model_tiers_come_from_config(monkeypatch: pytest.MonkeyPatch) -> None:
    s = get_settings()
    monkeypatch.setattr(s, "ai_provider", "anthropic")
    assert _request_kwargs("fast", "sys", "u", 10, None, False)["model"] == s.model_fast
    capable = _request_kwargs("capable", "sys", "u", 10, Report, False)
    assert capable["model"] == s.model_capable
    assert capable["fallbacks"] == "default"
    assert capable["output_config"]["format"]["type"] == "json_schema"


def test_interviewer_system_prompt_is_cached() -> None:
    kw = _request_kwargs("fast", "sys", "u", 10, InterviewerReply, True)
    assert kw["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "betas" not in kw

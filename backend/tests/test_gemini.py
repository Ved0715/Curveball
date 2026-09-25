"""Gemini provider, tested against a fake client: no network, no cost."""

import asyncio
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

import pytest
from google.genai import errors

from app import llm, llm_gemini
from app.config import get_settings
from app.llm import AIError, Finished, TextDelta
from app.prompts.interviewer import InterviewerReply


def chunk(text: str | None, finish: str | None = None, usage: tuple[int, int, int] | None = None) -> Any:
    cand = SimpleNamespace(finish_reason=SimpleNamespace(name=finish) if finish else None)
    um = (
        SimpleNamespace(
            prompt_token_count=usage[0], candidates_token_count=usage[1], thoughts_token_count=usage[2]
        )
        if usage
        else None
    )
    return SimpleNamespace(
        text=text, candidates=[cand], prompt_feedback=None, usage_metadata=um, model_version="served-model"
    )


def api_error(code: int, message: str) -> errors.APIError:
    cls = errors.ServerError if code >= 500 else errors.ClientError
    return cls(code, {"error": {"code": code, "message": message, "status": "X"}})


class FakeModels:
    """Each model has a queue of scripted responses: an exception raised when called,
    or a list of chunks (a chunk may itself be an exception, raised mid-stream)."""

    def __init__(self, script: dict[str, list[Any]]) -> None:
        self.script = script
        self.calls: list[tuple[str, Any]] = []

    async def generate_content_stream(self, model: str, contents: str, config: Any) -> AsyncIterator[Any]:
        self.calls.append((model, config))
        plan = self.script[model].pop(0)
        if isinstance(plan, Exception):
            raise plan

        async def gen() -> AsyncIterator[Any]:
            for item in plan:
                if isinstance(item, Exception):
                    raise item
                yield item

        return gen()


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> Any:
    s = get_settings()
    monkeypatch.setattr(s, "ai_provider", "gemini")
    monkeypatch.setattr(s, "ai_mock", False)
    monkeypatch.setattr(s, "gemini_models_fast", "m-a,m-b")

    def install(script: dict[str, Any]) -> FakeModels:
        models = FakeModels(script)
        client = SimpleNamespace(aio=SimpleNamespace(models=models))
        monkeypatch.setattr(llm_gemini, "_client", lambda: client)
        return models

    return install


def collect(**kw: Any) -> list[Any]:
    async def run() -> list[Any]:
        return [ev async for ev in llm.stream("fast", "sys", "user", 500, InterviewerReply, **kw)]

    return asyncio.run(run())


def test_streams_text_then_finished_with_usage(fake: Any) -> None:
    models = fake({"m-a": [[chunk('{"kind":"question",'), chunk('"say":"Hi"}', "STOP", (100, 20, 30))]]})
    evs = collect()
    assert [e.text for e in evs if isinstance(e, TextDelta)] == ['{"kind":"question",', '"say":"Hi"}']
    done = evs[-1]
    assert isinstance(done, Finished)
    assert (done.tokens_in, done.tokens_out, done.model) == (100, 50, "served-model")
    cfg = models.calls[0][1]
    assert cfg.response_mime_type == "application/json"
    assert cfg.response_json_schema["properties"]["kind"]
    assert cfg.thinking_config.thinking_level.name == "MINIMAL"


def test_falls_back_to_next_model_when_overloaded(fake: Any) -> None:
    models = fake(
        {
            "m-a": [api_error(503, "high demand")],
            "m-b": [[chunk('{"kind":"question","say":"Hi"}', "STOP", (1, 1, 0))]],
        }
    )
    assert isinstance(collect()[-1], Finished)
    assert [c[0] for c in models.calls] == ["m-a", "m-b"]


def test_falls_back_on_quota_and_reports_when_all_fail(fake: Any) -> None:
    fake({"m-a": [api_error(429, "quota")], "m-b": [api_error(429, "quota")]})
    with pytest.raises(AIError) as e:
        collect()
    assert e.value.code == "rate_limited"


def test_never_switches_model_after_text_streamed(fake: Any) -> None:
    models = fake({"m-a": [[chunk('{"kind":'), api_error(503, "dropped")]], "m-b": [[chunk("x", "STOP")]]})
    with pytest.raises(AIError):
        collect()
    assert [c[0] for c in models.calls] == ["m-a"]


def test_retries_without_unsupported_thinking_level(fake: Any) -> None:
    models = fake(
        {
            "m-a": [
                api_error(400, "Thinking level MINIMAL is not supported for this model."),
                [chunk('{"kind":"question","say":"Hi"}', "STOP", (1, 1, 0))],
            ]
        }
    )
    assert isinstance(collect()[-1], Finished)
    assert [c[0] for c in models.calls] == ["m-a", "m-a"]
    assert models.calls[0][1].thinking_config is not None
    assert models.calls[1][1].thinking_config is None


@pytest.mark.parametrize(
    ("finish", "code"),
    [("SAFETY", "refused"), ("PROHIBITED_CONTENT", "refused"), ("MAX_TOKENS", "invalid_output")],
)
def test_finish_reasons_map_to_error_codes(fake: Any, finish: str, code: str) -> None:
    fake({"m-a": [[chunk('{"kind":"question"', finish, (1, 1, 0))]]})
    with pytest.raises(AIError) as e:
        collect()
    assert e.value.code == code


def test_bad_key_is_not_configured_and_not_retried_elsewhere(fake: Any) -> None:
    models = fake({"m-a": [api_error(400, "API key not valid. Please pass a valid API key.")], "m-b": []})
    with pytest.raises(AIError) as e:
        collect()
    assert e.value.code == "not_configured"
    assert [c[0] for c in models.calls] == ["m-a"]


def test_model_for_uses_first_gemini_model(fake: Any) -> None:
    assert llm.model_for("fast") == "m-a"

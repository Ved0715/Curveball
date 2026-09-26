"""The OpenAI-compatible provider, tested against a fake client: no network, no cost."""

import asyncio
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

import httpx2
import openai
import pytest

from app import llm, llm_openai
from app.config import get_settings
from app.llm import AIError, Finished, TextDelta
from app.prompts.interviewer import InterviewerReply


def chunk(content: str | None = None, finish: str | None = None, usage: tuple[int, int] | None = None) -> Any:
    delta = SimpleNamespace(content=content)
    choice = SimpleNamespace(delta=delta, finish_reason=finish)
    u = SimpleNamespace(prompt_tokens=usage[0], completion_tokens=usage[1]) if usage else None
    return SimpleNamespace(choices=[choice], usage=u, model="served-model")


def status_error(cls: type[openai.APIStatusError], status: int, message: str) -> openai.APIStatusError:
    request = httpx2.Request("POST", "https://example.test/chat/completions")
    response = httpx2.Response(status, request=request)
    return cls(message, response=response, body={"error": {"message": message}})


class FakeCompletions:
    """A queue of scripted responses: an exception raised when called, or a list of
    chunks (a chunk may itself be an exception, raised mid-stream)."""

    def __init__(self, script: list[Any]) -> None:
        self.script = script
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> AsyncIterator[Any]:
        self.calls.append(kwargs)
        plan = self.script.pop(0)
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
    monkeypatch.setattr(s, "ai_provider", "openai")
    monkeypatch.setattr(s, "ai_mock", False)
    monkeypatch.setattr(s, "ai_api_key", "test-key")
    monkeypatch.setattr(s, "ai_base_url", "https://example.test/v1")
    monkeypatch.setattr(s, "ai_model", "qwen-3.8-27b")
    monkeypatch.setattr(s, "ai_reasoning_fast", "none")
    llm_openai._client.cache_clear()

    def install(script: list[Any]) -> FakeCompletions:
        completions = FakeCompletions(script)
        client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
        monkeypatch.setattr(llm_openai, "_client", lambda: client)
        return completions

    return install


def collect(**kw: Any) -> list[Any]:
    async def run() -> list[Any]:
        return [ev async for ev in llm.stream("fast", "sys", "user", 500, InterviewerReply, **kw)]

    return asyncio.run(run())


def test_streams_text_then_finished_with_usage(fake: Any) -> None:
    completions = fake([[chunk('{"kind":"question",'), chunk('"say":"Hi"}', finish="stop", usage=(100, 20))]])
    evs = collect()
    assert [e.text for e in evs if isinstance(e, TextDelta)] == ['{"kind":"question",', '"say":"Hi"}']
    done = evs[-1]
    assert isinstance(done, Finished)
    assert (done.tokens_in, done.tokens_out, done.model) == (100, 20, "served-model")
    call = completions.calls[0]
    assert call["model"] == "qwen-3.8-27b"
    assert call["reasoning_effort"] == "none"
    assert call["response_format"]["type"] == "json_schema"
    assert call["response_format"]["json_schema"]["schema"]["properties"]["kind"]


def test_reasoning_deltas_are_not_collected_as_text(fake: Any) -> None:
    """A reasoning-model gateway streams chain-of-thought separately from content."""
    reasoning_chunk = SimpleNamespace(
        choices=[
            SimpleNamespace(delta=SimpleNamespace(content=None, reasoning="thinking…"), finish_reason=None)
        ],
        usage=None,
        model="served-model",
    )
    fake([[reasoning_chunk, chunk('{"kind":"question","say":"Hi"}', finish="stop", usage=(1, 1))]])
    evs = collect()
    assert [e.text for e in evs if isinstance(e, TextDelta)] == ['{"kind":"question","say":"Hi"}']


def test_cut_off_at_max_tokens_is_invalid_output(fake: Any) -> None:
    fake([[chunk('{"kind":"quest', finish="length")]])
    with pytest.raises(AIError) as e:
        collect()
    assert e.value.code == "invalid_output"


def test_content_filter_is_refused(fake: Any) -> None:
    fake([[chunk(finish="content_filter")]])
    with pytest.raises(AIError) as e:
        collect()
    assert e.value.code == "refused"


def test_empty_stream_is_upstream(fake: Any) -> None:
    fake([[]])
    with pytest.raises(AIError) as e:
        collect()
    assert e.value.code == "upstream"


@pytest.mark.parametrize(
    ("cls", "status", "code"),
    [
        (openai.AuthenticationError, 401, "not_configured"),
        (openai.PermissionDeniedError, 403, "not_configured"),
        (openai.NotFoundError, 404, "not_configured"),
        (openai.RateLimitError, 429, "rate_limited"),
        (openai.InternalServerError, 500, "overloaded"),
    ],
)
def test_status_errors_map_to_codes(
    fake: Any, cls: type[openai.APIStatusError], status: int, code: str
) -> None:
    fake([status_error(cls, status, "boom")])
    with pytest.raises(AIError) as e:
        collect()
    assert e.value.code == code


def test_bad_request_mentioning_context_is_prompt_too_large(fake: Any) -> None:
    fake([status_error(openai.BadRequestError, 400, "maximum context length exceeded, too many tokens")])
    with pytest.raises(AIError) as e:
        collect()
    assert e.value.code == "prompt_too_large"


def test_connection_error_before_any_text_is_overloaded(fake: Any) -> None:
    fake([openai.APIConnectionError(request=httpx2.Request("POST", "https://example.test"))])
    with pytest.raises(AIError) as e:
        collect()
    assert e.value.code == "overloaded"


def test_missing_key_or_base_url_is_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    s = get_settings()
    monkeypatch.setattr(s, "ai_provider", "openai")
    monkeypatch.setattr(s, "ai_api_key", None)
    monkeypatch.setattr(s, "ai_base_url", "https://example.test/v1")
    llm_openai._client.cache_clear()
    with pytest.raises(AIError) as e:
        collect()
    assert e.value.code == "not_configured"


def test_model_for_uses_configured_openai_model(fake: Any) -> None:
    assert llm.model_for("fast") == "qwen-3.8-27b"


def test_reasoning_effort_omitted_when_blank(fake: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    """A blank tier setting means "let the gateway decide" - don't send the field at all."""
    monkeypatch.setattr(get_settings(), "ai_reasoning_fast", "")
    completions = fake([[chunk("hi", finish="stop", usage=(1, 1))]])
    collect()
    assert "reasoning_effort" not in completions.calls[0]

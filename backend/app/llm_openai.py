"""An OpenAI-compatible Chat Completions provider (any gateway speaking that protocol -
an internal proxy, a self-hosted vLLM server, etc.). Same contract as llm_gemini.py: stream
text deltas, then one ("done", ...); app/llm.py turns failures into an AIError.

Reasoning models (this codebase was built against a Qwen3 gateway) stream their chain of
thought as `delta.reasoning`, separate from `delta.content`. We only ever collect and
return `.content` - the reasoning is discarded, never sent to the client or validated
against a schema.
"""

import logging
from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Any

import openai
from pydantic import BaseModel

from app.config import get_settings

log = logging.getLogger("mockroom.llm")


@lru_cache
def _client() -> openai.AsyncOpenAI:
    from app.llm import AIError

    s = get_settings()
    if not s.ai_api_key or not s.ai_base_url:
        raise AIError("not_configured", "AI_API_KEY and AI_BASE_URL must both be set")
    return openai.AsyncOpenAI(
        api_key=s.ai_api_key.strip().strip("'\""),
        base_url=s.ai_base_url.strip(),
        max_retries=2,
        timeout=180.0,
    )


def _classify(e: openai.APIStatusError) -> str:
    if isinstance(e, openai.AuthenticationError | openai.PermissionDeniedError):
        return "not_configured"
    if isinstance(e, openai.NotFoundError):  # usually a wrong model name or base URL
        return "not_configured"
    if isinstance(e, openai.RateLimitError):
        return "rate_limited"
    if isinstance(e, openai.InternalServerError):
        return "overloaded"
    if isinstance(e, openai.BadRequestError):
        msg = str(e).lower()
        if "context" in msg or "too long" in msg or "maximum" in msg and "token" in msg:
            return "prompt_too_large"
        if "content_filter" in msg or "content filter" in msg or "safety" in msg:
            return "refused"
        return "upstream"
    return "overloaded" if e.status_code >= 500 else "upstream"


def _response_format(schema: type[BaseModel]) -> dict[str, Any]:
    return {
        "type": "json_schema",
        "json_schema": {"name": schema.__name__, "schema": schema.model_json_schema(), "strict": True},
    }


async def stream(
    model: str,
    system: str,
    user: str,
    max_tokens: int,
    schema: type[BaseModel] | None,
    reasoning_effort: str | None,
) -> AsyncIterator[Any]:
    """Yields ("delta", text) then ("done", text, tokens_in, tokens_out, model)."""
    from app.llm import AIError

    kwargs: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if schema is not None:
        kwargs["response_format"] = _response_format(schema)
    if reasoning_effort:
        kwargs["reasoning_effort"] = reasoning_effort

    parts: list[str] = []
    finish: str | None = None
    usage: Any = None
    served_model = model
    client = _client()  # outside the try: a missing key must surface as not_configured
    try:
        resp = await client.chat.completions.create(**kwargs)
        async for chunk in resp:
            if chunk.usage is not None:
                usage = chunk.usage
            served_model = chunk.model or served_model
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            finish = choice.finish_reason or finish
            delta = choice.delta
            text = delta.content if delta else None
            if text:
                parts.append(text)
                yield ("delta", text)
    except openai.APIStatusError as e:
        raise AIError(_classify(e), str(e)) from e  # type: ignore[arg-type]
    except openai.APIConnectionError as e:  # network errors, timeouts (no status code)
        raise AIError("overloaded" if not parts else "upstream", str(e)) from e

    if not parts and finish is None:
        raise AIError("upstream", f"{model}: empty stream")
    if finish == "content_filter":
        raise AIError("refused", f"{model}: content filter")
    if finish == "length":
        raise AIError("invalid_output", f"{model}: cut off at max_tokens (reasoning may have used it up)")

    result = "".join(parts)
    log.info("%s response (%d chars): %r", served_model, len(result), result[:500])

    tokens_in = getattr(usage, "prompt_tokens", 0) or 0
    tokens_out = getattr(usage, "completion_tokens", 0) or 0
    yield ("done", result, tokens_in, tokens_out, served_model)

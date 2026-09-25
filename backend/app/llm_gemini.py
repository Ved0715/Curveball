"""Gemini provider (google-genai SDK). Same contract as the Anthropic path in llm.py:
stream text deltas, then one Finished; every failure becomes an AIError.

Resilience: each tier has an ordered list of models. A model that is overloaded (503),
out of quota (429), or missing (404) is skipped for the next one, but only before any
text has streamed, so a response never mixes two models. The SDK also retries each
request briefly with backoff first.
"""

import logging
from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Any

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from app.config import get_settings

log = logging.getLogger("mockroom.llm")

# Finish reasons that mean the model declined (safety filters etc.).
_REFUSED = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"}
# Failures worth trying the next model for.
_NEXT_MODEL = {"rate_limited", "overloaded", "model_unavailable"}


class _ModelFailed(Exception):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code


@lru_cache
def _client() -> genai.Client:
    from app.llm import AIError

    key = get_settings().gemini_api_key
    if not key:
        raise AIError("not_configured", "GEMINI_API_KEY is not set")
    return genai.Client(
        api_key=key.strip().strip("'\""),
        http_options=types.HttpOptions(
            timeout=180_000,  # ms
            retry_options=types.HttpRetryOptions(
                attempts=2, initial_delay=1.5, max_delay=8, http_status_codes=[429, 500, 503, 504]
            ),
        ),
    )


def _classify(e: errors.APIError) -> str:
    msg = str(e.message or "").lower()
    if e.code in (401, 403) or "api key not valid" in msg or "api_key_invalid" in msg:
        return "not_configured"
    if e.code == 429:
        return "rate_limited"
    if e.code == 404:
        return "model_unavailable"
    if e.code >= 500:
        return "overloaded"
    if "token" in msg and ("exceed" in msg or "too long" in msg or "limit" in msg):
        return "prompt_too_large"
    if "thinking level" in msg or "thinking_level" in msg or "thinking budget" in msg:
        return "thinking_unsupported"
    return "upstream"


def _config(
    system: str, max_tokens: int, schema: type[BaseModel] | None, level: str | None
) -> types.GenerateContentConfig:
    kwargs: dict[str, Any] = {
        "system_instruction": system,
        "max_output_tokens": max_tokens,
        "automatic_function_calling": types.AutomaticFunctionCallingConfig(disable=True),
    }
    if schema is not None:
        kwargs["response_mime_type"] = "application/json"
        kwargs["response_json_schema"] = schema.model_json_schema(by_alias=True)
    if level:
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=level)
    return types.GenerateContentConfig(**kwargs)


async def _one_model(
    model: str, system: str, user: str, max_tokens: int, schema: type[BaseModel] | None, level: str | None
) -> AsyncIterator[Any]:
    """Stream one model. Yields ("delta", text) then ("done", text, tokens_in, tokens_out, model_version)."""
    config = _config(system, max_tokens, schema, level)
    client = _client()  # outside the try: a missing key must surface as not_configured
    parts: list[str] = []
    last: Any = None
    try:
        chunks = await client.aio.models.generate_content_stream(model=model, contents=user, config=config)
        async for chunk in chunks:
            last = chunk
            fb = getattr(chunk, "prompt_feedback", None)
            if fb is not None and getattr(fb, "block_reason", None):
                raise _ModelFailed("refused", f"prompt blocked: {fb.block_reason}")
            text = chunk.text if chunk.candidates else None
            if text:
                parts.append(text)
                yield ("delta", text)
    except errors.APIError as e:
        raise _ModelFailed(_classify(e), f"{model}: {e.code} {e.message}") from e
    except _ModelFailed:
        raise
    except Exception as e:  # network errors, timeouts
        raise _ModelFailed("overloaded" if not parts else "upstream", f"{model}: {e!r}") from e

    if last is None:
        raise _ModelFailed("upstream", f"{model}: empty stream")
    finish = last.candidates[0].finish_reason if last.candidates else None
    finish_name = getattr(finish, "name", str(finish or ""))
    if finish_name in _REFUSED:
        raise _ModelFailed("refused", f"{model}: finish {finish_name}")
    if finish_name == "MAX_TOKENS":
        raise _ModelFailed("invalid_output", f"{model}: cut off at max_output_tokens")
    u = last.usage_metadata
    tokens_in = (u.prompt_token_count or 0) if u else 0
    tokens_out = ((u.candidates_token_count or 0) + (u.thoughts_token_count or 0)) if u else 0
    yield ("done", "".join(parts), tokens_in, tokens_out, last.model_version or model)


async def stream(
    models: list[str],
    level: str | None,
    system: str,
    user: str,
    max_tokens: int,
    schema: type[BaseModel] | None,
) -> AsyncIterator[Any]:
    """Try each model in order. Yields the same tuples as _one_model."""
    from app.llm import AIError

    failure: _ModelFailed | None = None
    for model in models:
        lvl = level
        for _attempt in range(2):  # second pass only if the thinking level was rejected
            emitted = False
            try:
                async for item in _one_model(model, system, user, max_tokens, schema, lvl):
                    if item[0] == "delta":
                        emitted = True
                    yield item
                return
            except _ModelFailed as e:
                if e.code == "thinking_unsupported" and lvl and not emitted:
                    log.info("%s rejected thinking level %r; retrying without it", model, lvl)
                    lvl = None
                    continue
                if e.code in _NEXT_MODEL and not emitted:
                    log.warning("model %s unavailable (%s); trying the next model", model, e.code)
                    failure = e
                    break
                code = "overloaded" if e.code == "model_unavailable" else e.code
                raise AIError(code, str(e)) from e  # type: ignore[arg-type]
    assert failure is not None
    code = "overloaded" if failure.code == "model_unavailable" else failure.code
    raise AIError(code, f"all models failed; last: {failure}")  # type: ignore[arg-type]

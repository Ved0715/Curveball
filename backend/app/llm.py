"""The only module that talks to the Anthropic API.

Each call streams. Structured calls send a JSON schema (output_config.format), then
validate the finished text with Pydantic once; the caller decides whether to retry.
Every failure becomes an AIError with a short code the frontend turns into friendly copy.
"""

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

import anthropic
from pydantic import BaseModel, ValidationError

from app.config import get_settings

log = logging.getLogger("mockroom.llm")

Tier = Literal["fast", "balanced", "capable"]
ErrorCode = Literal[
    "not_configured",
    "rate_limited",
    "overloaded",
    "prompt_too_large",
    "refused",
    "invalid_output",
    "upstream",
]


class AIError(Exception):
    def __init__(self, code: ErrorCode, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code: ErrorCode = code
        self.retryable = code in ("rate_limited", "overloaded", "invalid_output", "upstream")


@dataclass(frozen=True)
class TextDelta:
    text: str


@dataclass(frozen=True)
class Finished:
    text: str
    tokens_in: int = 0
    tokens_out: int = 0
    model: str = ""  # the model that actually served the call (may differ after a fallback)


StreamEvent = TextDelta | Finished


def model_for(tier: Tier) -> str:
    s = get_settings()
    return {"fast": s.model_fast, "balanced": s.model_balanced, "capable": s.model_capable}[tier]


@lru_cache
def _client() -> anthropic.AsyncAnthropic:
    key = get_settings().anthropic_api_key
    if not key:
        raise AIError("not_configured", "ANTHROPIC_API_KEY is not set")
    return anthropic.AsyncAnthropic(api_key=key, max_retries=2, timeout=180.0)


def _request_kwargs(
    tier: Tier,
    system: str,
    user: str,
    max_tokens: int,
    schema: type[BaseModel] | None,
    cache_system: bool,
) -> dict[str, Any]:
    system_block: dict[str, Any] = {"type": "text", "text": system}
    if cache_system:
        # The system prompt (persona + JD + resume) is identical for every turn of an
        # interview, so caching it makes later turns cheaper and faster.
        system_block["cache_control"] = {"type": "ephemeral"}
    kwargs: dict[str, Any] = {
        "model": model_for(tier),
        "max_tokens": max_tokens,
        "system": [system_block],
        "messages": [{"role": "user", "content": user}],
    }
    if schema is not None:
        kwargs["output_config"] = {
            "format": {"type": "json_schema", "schema": anthropic.transform_schema(schema)}
        }
    if tier == "capable":
        # If the report model declines on a safety false positive, the API re-runs the
        # request on a fallback model in the same call instead of failing.
        kwargs["betas"] = ["server-side-fallback-2026-07-01"]
        kwargs["fallbacks"] = "default"
    return kwargs


async def stream(
    tier: Tier,
    system: str,
    user: str,
    max_tokens: int,
    schema: type[BaseModel] | None = None,
    cache_system: bool = False,
) -> AsyncIterator[StreamEvent]:
    """Yield text deltas, then one Finished with the full text."""
    kwargs = _request_kwargs(tier, system, user, max_tokens, schema, cache_system)
    try:
        async with _client().beta.messages.stream(**kwargs) as s:
            async for event in s:
                if event.type == "text":
                    yield TextDelta(event.text)
            final = await s.get_final_message()
    except anthropic.BadRequestError as e:
        msg = str(e).lower()
        if "too long" in msg or "too large" in msg or "context" in msg:
            raise AIError("prompt_too_large", str(e)) from e
        log.error("Anthropic bad request: %s", e)
        raise AIError("upstream", str(e)) from e
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as e:
        log.error("Anthropic auth failed: %s", e)
        raise AIError("not_configured", str(e)) from e
    except anthropic.RateLimitError as e:
        raise AIError("rate_limited", str(e)) from e
    except anthropic.InternalServerError as e:
        raise AIError("overloaded", str(e)) from e
    except anthropic.APIStatusError as e:
        code: ErrorCode = "overloaded" if e.status_code >= 500 else "upstream"
        raise AIError(code, str(e)) from e
    except anthropic.APIConnectionError as e:
        raise AIError("upstream", str(e)) from e

    log.info(
        "ai call tier=%s model=%s in=%s out=%s cache_read=%s stop=%s",
        tier,
        final.model,
        final.usage.input_tokens,
        final.usage.output_tokens,
        final.usage.cache_read_input_tokens,
        final.stop_reason,
    )
    if final.stop_reason == "refusal":
        raise AIError("refused")
    if final.stop_reason == "max_tokens":
        raise AIError("invalid_output", "response was cut off at max_tokens")
    parts: list[str] = []
    for block in final.content:
        if block.type == "fallback":
            parts = []  # a model declined mid-stream; only the rescuing model's text counts
        elif block.type == "text":
            parts.append(block.text)
    yield Finished(
        "".join(parts),
        tokens_in=final.usage.input_tokens
        + (final.usage.cache_read_input_tokens or 0)
        + (final.usage.cache_creation_input_tokens or 0),
        tokens_out=final.usage.output_tokens,
        model=final.model,
    )


def validate[M: BaseModel](schema: type[M], text: str) -> M:
    try:
        return schema.model_validate_json(text)
    except ValidationError as e:
        log.warning("model output failed validation: %s", e.errors()[:3])
        raise AIError("invalid_output", "response did not match schema") from e

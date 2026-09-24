"""Server-Sent Events plumbing shared by every AI endpoint.

Events: progress {chars} · say {text} · delta {text} · reset {} · result {...} · error {code, retryable}
"""

import logging
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass

from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app import llm
from app.llm import AIError, Finished, StreamEvent, TextDelta
from app.sse import event

log = logging.getLogger("mockroom.stream")


def sse_response(gen: AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(
        guard(gen),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def guard(gen: AsyncIterator[str]) -> AsyncIterator[str]:
    """Turn any failure into an `error` event; never leak raw errors to the browser."""
    try:
        async for chunk in gen:
            yield chunk
    except AIError as e:
        yield event("error", {"code": e.code, "retryable": e.retryable})
    except Exception:
        log.exception("unexpected error while streaming")
        yield event("error", {"code": "upstream", "retryable": True})


@dataclass
class Tally:
    """Token usage across the attempts of one request (retries cost too)."""

    tokens_in: int = 0
    tokens_out: int = 0
    calls: int = 0
    model: str = ""  # model that served the latest call

    def add(self, f: Finished) -> None:
        self.tokens_in += f.tokens_in
        self.tokens_out += f.tokens_out
        self.calls += 1
        self.model = f.model or self.model


async def structured[M: BaseModel](
    make_stream: Callable[[int], AsyncIterator[StreamEvent]],
    schema: type[M],
    on_text: Callable[[str], str | None],
    tally: Tally,
    check: Callable[[M], bool] = lambda _m: True,
) -> AsyncIterator[str | M]:
    """Run a structured call. Yields SSE strings while streaming, then the validated model.
    Invalid output (bad JSON, schema mismatch, or a failed rule `check`) is retried exactly once."""
    for attempt in range(2):
        if attempt:
            yield event("reset", {})
        buffer = ""
        try:
            async for ev in make_stream(attempt):
                if isinstance(ev, TextDelta):
                    buffer += ev.text
                    out = on_text(buffer)
                    if out:
                        yield out
                elif isinstance(ev, Finished):
                    tally.add(ev)
                    result = llm.validate(schema, ev.text)
                    if not check(result) and attempt == 0:
                        raise AIError("invalid_output", "rule check failed")
                    yield result
                    return
        except AIError as e:
            if e.code == "invalid_output" and attempt == 0:
                log.warning("retrying after invalid output")
                continue
            raise
    raise AIError("invalid_output")


def progress(buffer: str) -> str:
    return event("progress", {"chars": len(buffer)})

"""
Resilient streaming around Anthropic `messages.stream`.

Three reliability mechanisms are kept strictly separate so they never fight:
  1. Escalation (agents.core)      — business logic; bumps the *requested* model. Untouched here.
  2. SDK max_retries (config)      — transient retries while ESTABLISHING the request.
  3. stream_with_resilience (here) — bounded exponential backoff + a same-tier FALLBACK model.

Hard rule: retry/fallback happens ONLY before the first text delta is emitted. Once a byte
has streamed to the client (SSE or voice), a transparent retry would double-emit, so we
re-raise instead. This makes fallback a pre-first-token mechanism and preserves TTFT.

We hand-roll backoff rather than use tenacity: the retry decision depends on whether any
output was already emitted mid-stream, which a declarative retry decorator can't express.
"""
import asyncio
import random
from collections.abc import AsyncGenerator
from typing import Any

from app.monitoring import logger

# Retryable transient failures. Import defensively so a missing/renamed SDK symbol
# degrades to "retry nothing specific" rather than crashing at import time.
try:
    from anthropic import (
        APIConnectionError,
        APITimeoutError,
        InternalServerError,
        RateLimitError,
    )

    _RETRYABLE: tuple[type[Exception], ...] = (
        APIConnectionError,
        APITimeoutError,
        InternalServerError,
        RateLimitError,
    )
except ImportError:  # pragma: no cover
    _RETRYABLE = ()

_BASE_DELAY_S = 0.5
_MAX_DELAY_S = 8.0


def _backoff(attempt: int) -> float:
    """Exponential backoff with full jitter: rand(0, min(cap, base*2^attempt))."""
    ceiling = min(_MAX_DELAY_S, _BASE_DELAY_S * (2 ** attempt))
    return random.uniform(0, ceiling)


def _is_retryable(exc: Exception) -> bool:
    return isinstance(exc, _RETRYABLE) if _RETRYABLE else False


async def stream_with_resilience(
    client: Any,
    *,
    models: list[str],
    max_retries: int,
    **stream_kwargs: Any,
) -> AsyncGenerator[tuple[str, Any], None]:
    """Yield ("delta", text) events, then one ("final", Message).

    `models` is tried in order (primary first, fallback next). For each model we make up
    to `max_retries + 1` attempts on transient errors, but abandon retries the moment any
    delta has been emitted. Non-retryable errors (4xx, auth, validation) propagate at once.
    """
    last_exc: Exception | None = None

    for model_index, model in enumerate(models):
        for attempt in range(max_retries + 1):
            emitted = False
            try:
                async with client.messages.stream(model=model, **stream_kwargs) as stream:
                    async for text in stream.text_stream:
                        emitted = True
                        yield ("delta", text)
                    final = await stream.get_final_message()
                    yield ("final", final)
                return  # clean completion
            except Exception as exc:  # noqa: BLE001 — classified below
                last_exc = exc
                if emitted:
                    # Partial output already on the wire — cannot retry transparently.
                    logger.error(
                        "stream_failed_midstream",
                        extra={"extra_data": {"model": model, "error": str(exc)}},
                    )
                    raise
                if not _is_retryable(exc):
                    raise
                # Pre-first-token transient failure: back off and retry this model.
                delay = _backoff(attempt)
                logger.info(
                    "stream_retry",
                    extra={
                        "extra_data": {
                            "model": model,
                            "attempt": attempt,
                            "delay_s": round(delay, 2),
                            "error": str(exc),
                        }
                    },
                )
                await asyncio.sleep(delay)

        # Exhausted retries for this model → fall through to the next (fallback) model.
        if model_index < len(models) - 1:
            logger.info(
                "stream_fallback_model",
                extra={"extra_data": {"from": model, "to": models[model_index + 1]}},
            )

    # Every model + retry exhausted without emitting a token.
    assert last_exc is not None
    raise last_exc

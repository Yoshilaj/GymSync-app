"""
Observability primitives shared across the API.

  JSONFormatter / get_logger — structured JSON logs (one object per line).
  MetricsCollector           — in-process counters (requests, errors, latency, TTFT, tokens, cache).
  RequestTimer               — context manager that measures wall-clock ms.
  traced                     — LangSmith @traceable, or a no-op passthrough when no key is set.

Metrics live in a single module-global collector wired in main.lifespan, mirroring the
existing `database._db` / `config.settings` singleton pattern. In-process only — reset on
restart, per-worker. Redis/statsd is the multi-worker upgrade path.
"""
import json
import logging
import os
import time
from collections.abc import Callable
from typing import Any

from app.config import settings


# ── Structured logging ────────────────────────────────────────────────────────

class JSONFormatter(logging.Formatter):
    """Render each record as a single-line JSON object.

    Structured context is passed via `logger.info(msg, extra={"extra_data": {...}})`
    and merged into the top-level object.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        extra = getattr(record, "extra_data", None)
        if isinstance(extra, dict):
            payload.update(extra)
        if record.exc_info:
            # Full traceback goes to the log sink only — never to a client response.
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def get_logger(name: str = "gymsync") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:  # idempotent across imports / reloads
        handler = logging.StreamHandler()
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)
        logger.setLevel(settings.log_level.upper())
        logger.propagate = False
    return logger


# ── Metrics ───────────────────────────────────────────────────────────────────

class MetricsCollector:
    """In-process counters with a computed summary. Thread-safety is not required:
    the event loop is single-threaded and increments are non-awaiting."""

    def __init__(self) -> None:
        self._m: dict[str, float] = {
            "requests_total": 0,
            "errors_total": 0,
            "latency_ms_sum": 0.0,
            "latency_ms_count": 0,
            "ttft_ms_sum": 0.0,
            "ttft_ms_count": 0,
            "tokens_input": 0,
            "tokens_output": 0,
            "cache_hits": 0,
            "cache_misses": 0,
        }

    def record_request(
        self,
        *,
        latency_ms: float,
        ttft_ms: float | None = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        error: bool = False,
    ) -> None:
        self._m["requests_total"] += 1
        self._m["latency_ms_sum"] += latency_ms
        self._m["latency_ms_count"] += 1
        if ttft_ms is not None:
            self._m["ttft_ms_sum"] += ttft_ms
            self._m["ttft_ms_count"] += 1
        self._m["tokens_input"] += input_tokens
        self._m["tokens_output"] += output_tokens
        if error:
            self._m["errors_total"] += 1

    def record_cache(self, *, hit: bool) -> None:
        self._m["cache_hits" if hit else "cache_misses"] += 1

    @property
    def summary(self) -> dict[str, Any]:
        m = self._m
        reqs = m["requests_total"] or 1
        lat_n = m["latency_ms_count"] or 1
        ttft_n = m["ttft_ms_count"] or 1
        cache_total = (m["cache_hits"] + m["cache_misses"]) or 1
        return {
            "requests_total": int(m["requests_total"]),
            "errors_total": int(m["errors_total"]),
            "error_rate": round(m["errors_total"] / reqs, 4),
            "avg_latency_ms": round(m["latency_ms_sum"] / lat_n, 1),
            "avg_ttft_ms": round(m["ttft_ms_sum"] / ttft_n, 1),
            "tokens_input": int(m["tokens_input"]),
            "tokens_output": int(m["tokens_output"]),
            "cache_hits": int(m["cache_hits"]),
            "cache_misses": int(m["cache_misses"]),
            "cache_hit_rate": round(m["cache_hits"] / cache_total, 4),
        }


class RequestTimer:
    """`with RequestTimer() as t: ...` then read `t.elapsed_ms`."""

    def __init__(self) -> None:
        self.elapsed_ms: float = 0.0
        self._start: float = 0.0

    def start(self) -> "RequestTimer":
        """Start the clock without a `with` block (for use inside async generators)."""
        self._start = time.perf_counter()
        return self

    def __enter__(self) -> "RequestTimer":
        return self.start()

    def __exit__(self, *exc: object) -> None:
        self.elapsed_ms = (time.perf_counter() - self._start) * 1000.0

    def peek_ms(self) -> float:
        """Elapsed so far, without closing the timer (used to stamp TTFT)."""
        return (time.perf_counter() - self._start) * 1000.0


# ── Tracing ───────────────────────────────────────────────────────────────────

def _noop_traceable(*_a: object, **_k: object) -> Callable:
    def deco(fn: Callable) -> Callable:
        return fn
    return deco


# Resolve LangSmith once. Without a key, `traced` is a transparent no-op decorator
# so call sites never branch on whether tracing is enabled. When a key is present we
# export the env vars the langsmith SDK reads (it does not consume our Settings object).
if settings.langsmith_api_key:
    os.environ.setdefault("LANGSMITH_API_KEY", settings.langsmith_api_key)
    os.environ.setdefault("LANGSMITH_PROJECT", settings.langsmith_project)
    os.environ.setdefault("LANGSMITH_TRACING", "true")
    try:
        from langsmith import traceable as _traceable  # type: ignore

        traced = _traceable
    except ImportError:  # dependency not installed → degrade gracefully
        traced = _noop_traceable
else:
    traced = _noop_traceable


# Module-global collector, wired in main.lifespan.
metrics = MetricsCollector()
logger = get_logger()

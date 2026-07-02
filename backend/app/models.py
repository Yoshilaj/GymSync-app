"""
Pydantic request/response schemas for the HTTP surface.

Request bodies are validated here (length bounds are the first line of defense against
oversized / abusive payloads, before any model or DB call). Response models keep the ops
endpoints self-documenting in the OpenAPI schema.
"""
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10_000)
    session_id: str | None = None


class HealthResponse(BaseModel):
    status: str                      # "healthy" | "degraded"
    environment: str
    checks: dict[str, bool]          # per-component readiness (db, anthropic, cache)


class MetricsResponse(BaseModel):
    requests_total: int
    errors_total: int
    error_rate: float
    avg_latency_ms: float
    avg_ttft_ms: float
    tokens_input: int
    tokens_output: int
    cache_hits: int
    cache_misses: int
    cache_hit_rate: float


class CacheStatsResponse(BaseModel):
    backend: str
    entries: int
    hits: int
    misses: int
    hit_rate: float

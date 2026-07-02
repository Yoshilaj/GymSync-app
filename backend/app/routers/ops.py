"""
Operational endpoints for probes and dashboards.

  GET /health      — deep readiness: db + anthropic key + cache. Drives Docker/Render probes.
  GET /metrics     — request/latency/token/error/cache counters (in-process).
  GET /cache-stats — hit/miss/hit-rate for the response/knowledge cache.

Kept deliberately dependency-light and side-effect free so a probe never mutates state.
"""
from fastapi import APIRouter

from app.config import settings
from app.database import _db
from app.models import CacheStatsResponse, HealthResponse, MetricsResponse
from app.monitoring import metrics
from app.runtime import get_cache

router = APIRouter(tags=["ops"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    checks = {
        "db": _db is not None,
        "anthropic": bool(settings.anthropic_api_key),
        "cache": _cache_ready(),
    }
    status = "healthy" if all(checks.values()) else "degraded"
    return HealthResponse(status=status, environment=settings.app_env, checks=checks)


@router.get("/metrics", response_model=MetricsResponse)
async def get_metrics() -> MetricsResponse:
    return MetricsResponse(**metrics.summary)


@router.get("/cache-stats", response_model=CacheStatsResponse)
async def cache_stats() -> CacheStatsResponse:
    return CacheStatsResponse(**get_cache().stats)


def _cache_ready() -> bool:
    try:
        get_cache()
        return True
    except RuntimeError:
        return False

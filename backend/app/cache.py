"""
Cache abstraction.

  Cache            — the Protocol every backend satisfies (async get/set + sync stats).
  InMemoryTTLCache — process-local dict, SHA256 keys, per-entry TTL. Used now.
  RedisCache       — drop-in for multi-worker deployments. Stub until `redis_url` is set.
  make_key         — stable SHA256 over ordered key parts.

Why in-memory is correct today: the knowledge/embedding caches sit over a *static shared
corpus*, so per-worker duplication is a hit-rate detail, not a correctness bug. The real
forcing function for Redis is globally-correct rate limiting across workers — see ratelimit.py.
"""
import hashlib
import time
from typing import Any, Protocol, runtime_checkable


def make_key(*parts: Any) -> str:
    """Stable content-addressed key. Order matters; ints are stringified and
    None gets a distinct sentinel so it never collides with an empty string."""
    joined = "␟".join("\x00None\x00" if p is None else str(p) for p in parts)  # ␟ separator
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


@runtime_checkable
class Cache(Protocol):
    async def get(self, key: str) -> Any | None: ...
    async def set(self, key: str, value: Any, ttl_s: int | None = None) -> None: ...
    @property
    def stats(self) -> dict[str, Any]: ...


class InMemoryTTLCache:
    """Process-local TTL cache. Not shared across workers (see module docstring)."""

    def __init__(self, default_ttl_s: int = 300) -> None:
        self._default_ttl_s = default_ttl_s
        self._store: dict[str, tuple[float, Any]] = {}  # key -> (expires_at, value)
        self._hits = 0
        self._misses = 0

    async def get(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if entry is None:
            self._misses += 1
            return None
        expires_at, value = entry
        if time.time() >= expires_at:
            self._store.pop(key, None)  # lazy eviction
            self._misses += 1
            return None
        self._hits += 1
        return value

    async def set(self, key: str, value: Any, ttl_s: int | None = None) -> None:
        ttl = self._default_ttl_s if ttl_s is None else ttl_s
        self._store[key] = (time.time() + ttl, value)

    @property
    def stats(self) -> dict[str, Any]:
        total = (self._hits + self._misses) or 1
        return {
            "backend": "in_memory",
            "entries": len(self._store),
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(self._hits / total, 4),
        }


class RedisCache:
    """Placeholder for the multi-worker upgrade path. Instantiated only when
    `settings.redis_url` is set; wiring an async redis client is a later task."""

    def __init__(self, redis_url: str, default_ttl_s: int = 300) -> None:  # pragma: no cover
        raise NotImplementedError(
            "RedisCache is not wired yet — flip on when running multiple workers. "
            "Implement with redis.asyncio and JSON (de)serialization behind get/set."
        )


def build_cache(redis_url: str | None, default_ttl_s: int) -> Cache:
    """Factory: honour redis_url when present, else in-memory."""
    if redis_url:
        return RedisCache(redis_url, default_ttl_s)  # pragma: no cover
    return InMemoryTTLCache(default_ttl_s)

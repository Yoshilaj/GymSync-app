"""
Lifespan-initialized singletons that need settings at construction time.

`metrics` and `logger` live in monitoring.py (no construction args). The cache needs the
resolved settings (redis_url / TTL), so it is built in main.lifespan and stashed here.
Mirrors the `database._db` pattern: set once on startup, read via the getter everywhere.
"""
from app.cache import Cache

_cache: Cache | None = None


def set_cache(cache: Cache) -> None:
    global _cache
    _cache = cache


def get_cache() -> Cache:
    if _cache is None:
        raise RuntimeError("Cache not initialized — call set_cache() during app startup")
    return _cache

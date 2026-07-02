import time

from app.cache import InMemoryTTLCache, make_key


async def test_hit_and_miss():
    cache = InMemoryTTLCache(default_ttl_s=60)
    assert await cache.get("absent") is None
    await cache.set("k", {"v": 1})
    assert await cache.get("k") == {"v": 1}
    stats = cache.stats
    assert stats["hits"] == 1
    assert stats["misses"] == 1
    assert stats["entries"] == 1


async def test_ttl_expiry():
    cache = InMemoryTTLCache(default_ttl_s=60)
    await cache.set("k", "v", ttl_s=0)  # already expired
    time.sleep(0.01)
    assert await cache.get("k") is None  # lazily evicted on read


def test_make_key_is_stable_and_order_sensitive():
    assert make_key("a", "b", 1) == make_key("a", "b", 1)
    assert make_key("a", "b") != make_key("b", "a")
    assert make_key("a", None) != make_key("a", "")  # None distinct from empty is fine


async def test_hit_rate():
    cache = InMemoryTTLCache()
    await cache.set("k", 1)
    await cache.get("k")   # hit
    await cache.get("x")   # miss
    assert cache.stats["hit_rate"] == 0.5

"""
Rate limiting.

  limiter        — slowapi Limiter for HTTP endpoints, keyed by user identity (JWT), not IP
                   (many users share a NAT/gym Wi-Fi; the bearer token is the real principal).
  ws_rate_check  — hand-rolled per-user sliding-window guard for WebSocket turns, since
                   slowapi/ASGI middleware never see WS frames.

Both are in-process. Correct for a single worker; multi-worker enforcement needs a shared
store (Redis) — the same forcing function called out in cache.py. Flip via settings.redis_url.
"""
import hashlib
import time

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.config import settings


def _identity(request: Request) -> str:
    """Stable per-user key from the bearer token; fall back to client IP if unauthenticated."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        return "u:" + hashlib.sha256(token.encode()).hexdigest()[:16]
    return get_remote_address(request)


limiter = Limiter(key_func=_identity)


class _WsRateLimiter:
    """Fixed-cost sliding window: at most `per_min` turns per user per 60s."""

    def __init__(self, per_min: int) -> None:
        self._per_min = per_min
        self._hits: dict[str, list[float]] = {}

    def check(self, user_id: str) -> bool:
        now = time.time()
        window_start = now - 60.0
        hits = [t for t in self._hits.get(user_id, []) if t > window_start]
        if len(hits) >= self._per_min:
            self._hits[user_id] = hits  # persist the pruned window
            return False
        hits.append(now)
        self._hits[user_id] = hits
        return True


_ws_limiter = _WsRateLimiter(settings.ws_rate_limit_per_min)


def ws_rate_check(user_id: str) -> bool:
    """True if this WS turn is allowed; False if the user is over their per-minute budget."""
    return _ws_limiter.check(user_id)

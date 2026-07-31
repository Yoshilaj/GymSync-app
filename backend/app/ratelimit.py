"""
Rate limiting.

`app/cache.py` has referenced "see ratelimit.py" since it was written; this is that
file. Until now there was none, anywhere — /auth/login and /auth/signup were
protected only by Supabase's own limits, and /plans/generate-anonymous, which is
unauthenticated and spends Anthropic tokens on every call, by nothing at all.

DESIGN NOTES, in the order they'd bite you:

1. ONE LIMIT FOR EVERY ROUTE IS WRONG. A budget that lets someone try 60 passwords a
   minute is nowhere near strict enough for login, and a budget tight enough for
   login would break a workout logging sets. So limits are per-route and sized by
   what the route costs and what abusing it buys.

2. LOCKOUT IS ITSELF AN ATTACK. Limiting login purely by email address lets anyone
   lock a known victim out by failing their login repeatedly. So login is limited by
   IP *and* by email on separate budgets — flooding one address can't exhaust
   another user's, and the per-IP budget still stops a spray across many accounts.

3. ONLY FAILURES COUNT ON LOGIN. Consuming budget on a *successful* sign-in punishes
   normal use — an app that signs in on every cold start would rate-limit its own
   users. `consume` is called from the failure path.

4. THE CLIENT IP IS A CLAIM, NOT A FACT. X-Forwarded-For is trivially spoofed unless
   a proxy you control is appending it. We read it only when TRUSTED_PROXY is set,
   and then take the LAST entry (the one the nearest trusted hop wrote) rather than
   the first (which the client wrote).

5. WALL-CLOCK TIME GOES BACKWARDS. An NTP correction that steps the clock back
   would, with time.time(), leave the sweep scheduler believing the next sweep is
   still in the future — it would stop reclaiming buckets and the dict would grow
   without bound. Everything here is deltas, so it uses time.monotonic(), which
   cannot move backwards.

6. IN-MEMORY IS A SINGLE-WORKER STORY. With N workers a limit of 10 becomes 10N.
   That's the honest state today (one worker), and the fix is the Redis path already
   stubbed in cache.py — the Bucket interface here is deliberately narrow enough to
   swap.
"""

import logging
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Budget:
    """`limit` events per `window_s`, tracked per key."""

    limit: int
    window_s: int
    #: What the 429 says. Written for the person who hit it, not for a log.
    message: str = "Too many attempts. Please wait a moment and try again."


# Sized by cost and by what abuse buys. Comments say why, because the numbers
# are otherwise indistinguishable from arbitrary.
BUDGETS = {
    # Password guessing. Tight per account, looser per IP so a shared NAT (a gym's
    # wifi, a university) doesn't lock out everyone behind it on one bad day.
    "login_email": Budget(8, 300, "Too many sign-in attempts for this account. Wait 5 minutes."),
    "login_ip": Budget(30, 300, "Too many sign-in attempts. Wait a few minutes."),
    # Account creation: cheap for us, but the vector for mass-signup spam, and every
    # one of them sends an email on our SMTP quota.
    "signup_ip": Budget(5, 3600, "Too many accounts created. Try again later."),
    # Reset emails are the classic mailbox-flooding tool — strict per address.
    "reset_email": Budget(3, 3600, "A reset link was already sent. Check your inbox, including spam."),
    "reset_ip": Budget(10, 3600, "Too many reset requests. Try again later."),
    # Password changes: a slow drip is fine, a burst means someone is testing.
    "password_change": Budget(10, 900),
    # Unauthenticated AND it calls the model — the single most expensive thing a
    # stranger can make this server do.
    "generate_anonymous_ip": Budget(5, 3600, "You've generated several plans already. Try again later."),
    # 2FA codes are six digits; without a cap, brute force is a matter of minutes.
    "mfa_state": Budget(20, 300),
}


class _Bucket:
    """Fixed-window counter. Not a token bucket: a window is easier to reason about
    when the number appears in a user-facing message ("wait 5 minutes")."""

    __slots__ = ("count", "reset_at")

    def __init__(self, reset_at: float) -> None:
        self.count = 0
        self.reset_at = reset_at


_buckets: dict[str, _Bucket] = {}
_last_sweep = 0.0
_SWEEP_EVERY_S = 300


def _sweep(now: float) -> None:
    """Drop expired buckets so a long-running process doesn't accumulate one entry
    per IP that ever touched it. Cheap and amortised — this is the whole reason the
    dict can't just grow forever."""
    global _last_sweep
    if now - _last_sweep < _SWEEP_EVERY_S:
        return
    _last_sweep = now
    for key in [k for k, b in _buckets.items() if b.reset_at <= now]:
        _buckets.pop(key, None)


def client_ip(request: Request) -> str:
    """Best available client identity. See design note 4 — this is a claim."""
    if settings.trusted_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # Last hop wins: everything to its left may have been written by the
            # client. Taking [0], as most examples do, is what makes XFF spoofable.
            return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def _check(budget_name: str, key: str, *, consume: bool) -> None:
    budget = BUDGETS[budget_name]
    now = time.monotonic()
    _sweep(now)

    full_key = f"{budget_name}:{key}"
    bucket = _buckets.get(full_key)
    if bucket is None or bucket.reset_at <= now:
        bucket = _Bucket(now + budget.window_s)
        _buckets[full_key] = bucket

    if bucket.count >= budget.limit:
        retry_after = max(1, int(bucket.reset_at - now))
        logger.info("Rate limit hit: %s (retry in %ss)", full_key, retry_after)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=budget.message,
            headers={"Retry-After": str(retry_after)},
        )

    if consume:
        bucket.count += 1


def enforce(budget_name: str, key: str) -> None:
    """Count this event and reject once the budget is spent."""
    _check(budget_name, key, consume=True)


def check_only(budget_name: str, key: str) -> None:
    """Reject if the budget is already spent, WITHOUT spending any of it.

    For login: pair this at the top of the handler with `consume` on the failure
    path, so successful sign-ins cost nothing (design note 3).
    """
    _check(budget_name, key, consume=False)


def consume(budget_name: str, key: str) -> None:
    """Spend one unit without rejecting. Called after a failure."""
    budget = BUDGETS[budget_name]
    now = time.monotonic()
    full_key = f"{budget_name}:{key}"
    bucket = _buckets.get(full_key)
    if bucket is None or bucket.reset_at <= now:
        bucket = _Bucket(now + budget.window_s)
        _buckets[full_key] = bucket
    bucket.count += 1


def reset_all() -> None:
    """Tests only."""
    global _last_sweep
    _buckets.clear()
    _last_sweep = 0.0

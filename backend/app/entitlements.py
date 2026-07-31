"""
Paid-feature access: tier gates and metered quotas.

The client-side gates exist to make the app feel coherent. THIS is the security
boundary — a client is just a program the customer controls, and the paywall is
a suggestion until the server says no.

Every refusal is a 403 with a structured `detail`, so a call site can tell
"upgrade to use this at all" from "you've used this month's allowance" and open
the paywall on the right tier instead of showing a generic error.

    {"code": "upgrade_required", "required_tier": "pro", "current_tier": "free"}
    {"code": "quota_exhausted",  "required_tier": "pro", "current_tier": "free",
     "feature": "chat_message", "limit": 10, "used": 10, "resets_at": "..."}
"""
from __future__ import annotations

import calendar
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from supabase import AsyncClient

from app.auth import get_current_user_id
from app.billing import store
from app.billing.entitlement import Tier, meets
from app.database import get_db

logger = logging.getLogger(__name__)


async def resolve_tier(user_id: str, db: AsyncClient) -> Tier:
    """The user's tier, or "free" if it can't be read.

    Fails CLOSED, for the reason spelled out in agents/core.py: an outage that briefly
    costs a paying customer their Premium extras is a bug, and an outage that hands
    those extras to everyone is a security hole. Only one of those is worth risking.

    Use this where a route needs the tier as a VALUE (to shape a response). Use
    `require_tier` where the tier decides whether the route runs at all.
    """
    try:
        return await store.tier_for_user(user_id, db)
    except Exception:
        logger.warning("tier lookup failed for %s; treating as free", user_id, exc_info=True)
        return "free"

# ── Features and their limits ────────────────────────────────────────────────

VOICE_SESSION = "voice_session"
CHAT_MESSAGE = "chat_message"
PLAN_GENERATION = "plan_generation"

UNLIMITED = -1


@dataclass(frozen=True)
class Quota:
    """
    One metered capability.

    `period` picks the bucket key, so the same machinery serves a daily cap, a
    monthly allowance and a lifetime one-shot.

    `min_tier` is the tier at which the feature becomes available at all —
    distinct from having run out of it. Free's zero voice sessions is an upgrade
    prompt, not an exhausted allowance, and the two want different copy.
    """

    feature: str
    period: str  # "day" | "month" | "lifetime"
    limits: dict[Tier, int]
    min_tier: Tier

    def limit_for(self, tier: Tier) -> int:
        return self.limits.get(tier, 0)


QUOTAS: dict[str, Quota] = {
    # Pro buys live voice coaching, with an allowance. Premium is unmetered.
    VOICE_SESSION: Quota(
        feature=VOICE_SESSION,
        period="month",
        limits={"free": 0, "pro": 10, "premium": UNLIMITED},
        min_tier="pro",
    ),
    # Free's "AI Chat Coach — Limited messages". Daily, so a free user is never
    # permanently dead-ended: the tab works again tomorrow.
    CHAT_MESSAGE: Quota(
        feature=CHAT_MESSAGE,
        period="day",
        limits={"free": 10, "pro": UNLIMITED, "premium": UNLIMITED},
        min_tier="free",
    ),
    # Free's "One-time AI Plan Generation" — one, ever.
    PLAN_GENERATION: Quota(
        feature=PLAN_GENERATION,
        period="lifetime",
        limits={"free": 1, "pro": UNLIMITED, "premium": UNLIMITED},
        min_tier="free",
    ),
}

# Agent tools that only Premium may call. Filtered out of the tool list before
# the model ever sees them, and re-checked at execution — see agents/tools.py.
PREMIUM_TOOLS = frozenset({
    "search_knowledge",
    "report_injury",
    "remember_about_user",
    "get_exercise_history",
})


class QuotaExceeded(Exception):
    """
    A metered feature is unavailable. Carries everything a paywall prompt needs.

    An exception rather than an HTTPException because the loudest caller is the
    voice WebSocket, which cannot raise HTTP — it has to send a frame. The HTTP
    routers convert it via `as_http()`.
    """

    def __init__(
        self,
        *,
        code: str,
        feature: str,
        current_tier: Tier,
        required_tier: Tier,
        limit: int | None = None,
        used: int | None = None,
        resets_at: str | None = None,
        message: str = "",
    ) -> None:
        super().__init__(message or code)
        self.code = code
        self.feature = feature
        self.current_tier = current_tier
        self.required_tier = required_tier
        self.limit = limit
        self.used = used
        self.resets_at = resets_at
        self.message = message

    def detail(self) -> dict:
        payload = {
            "code": self.code,
            "feature": self.feature,
            "current_tier": self.current_tier,
            "required_tier": self.required_tier,
            "message": self.message,
        }
        if self.limit is not None:
            payload["limit"] = self.limit
            payload["used"] = self.used
            payload["resets_at"] = self.resets_at
        return payload

    def as_http(self) -> HTTPException:
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=self.detail())


# ── Period keys ──────────────────────────────────────────────────────────────


def period_key(period: str, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    if period == "day":
        return now.strftime("%Y-%m-%d")
    if period == "month":
        return now.strftime("%Y-%m")
    return "all"


def period_reset(period: str, now: datetime | None = None) -> str | None:
    """
    When the current bucket rolls over — the "try again after" a prompt shows.

    None for lifetime: it never resets, and saying otherwise would promise
    something that isn't coming.
    """
    now = now or datetime.now(timezone.utc)
    if period == "day":
        nxt = datetime.combine(now.date() + timedelta(days=1), datetime.min.time())
        return nxt.replace(tzinfo=timezone.utc).isoformat()
    if period == "month":
        last = calendar.monthrange(now.year, now.month)[1]
        first_next = date(now.year, now.month, last) + timedelta(days=1)
        nxt = datetime.combine(first_next, datetime.min.time())
        return nxt.replace(tzinfo=timezone.utc).isoformat()
    return None


# ── Checks ───────────────────────────────────────────────────────────────────


async def check_quota(
    feature: str,
    user_id: str,
    db: AsyncClient,
    *,
    tier: Tier | None = None,
) -> tuple[Tier, int]:
    """
    May this user use `feature` right now? Raises QuotaExceeded if not.

    Returns (tier, remaining) — remaining is UNLIMITED when uncapped.

    Read-only on purpose. Consumption is a separate call, so an operation that
    fails for an unrelated reason (Apple is down, the model errored) does not
    silently burn an allowance the customer never got the benefit of.
    """
    quota = QUOTAS[feature]
    tier = tier or await store.tier_for_user(user_id, db)

    if not meets(tier, quota.min_tier):
        raise QuotaExceeded(
            code="upgrade_required",
            feature=feature,
            current_tier=tier,
            required_tier=quota.min_tier,
            message=_upgrade_message(feature, quota.min_tier),
        )

    limit = quota.limit_for(tier)
    if limit == UNLIMITED:
        return tier, UNLIMITED

    if limit <= 0:
        raise QuotaExceeded(
            code="upgrade_required",
            feature=feature,
            current_tier=tier,
            required_tier=quota.min_tier,
            message=_upgrade_message(feature, quota.min_tier),
        )

    used = await store.usage_count(user_id, feature, period_key(quota.period), db)
    if used >= limit:
        raise QuotaExceeded(
            code="quota_exhausted",
            feature=feature,
            current_tier=tier,
            required_tier=_next_tier_up(tier),
            limit=limit,
            used=used,
            resets_at=period_reset(quota.period),
            message=_exhausted_message(feature, limit, quota.period),
        )

    return tier, limit - used


async def consume_quota(feature: str, user_id: str, db: AsyncClient) -> None:
    """
    Record one use. Call AFTER the work succeeded.

    Uncapped tiers are not counted at all — there is nothing to enforce, and
    writing a row per message for every paying customer would make this table
    the busiest one in the database for no benefit.
    """
    quota = QUOTAS[feature]
    tier = await store.tier_for_user(user_id, db)
    if quota.limit_for(tier) == UNLIMITED:
        return
    await store.increment_usage(user_id, feature, period_key(quota.period), db)


def _next_tier_up(tier: Tier) -> Tier:
    return "premium" if tier == "pro" else "pro"


def _upgrade_message(feature: str, required: Tier) -> str:
    name = required.capitalize()
    return {
        VOICE_SESSION: f"Live voice coaching is a {name} feature.",
        CHAT_MESSAGE: f"Unlimited coaching chat is a {name} feature.",
        PLAN_GENERATION: f"Unlimited plan generation is a {name} feature.",
    }.get(feature, f"This is a {name} feature.")


def _exhausted_message(feature: str, limit: int, period: str) -> str:
    if feature == CHAT_MESSAGE:
        return f"You've used today's {limit} free messages. Upgrade for unlimited coaching."
    if feature == VOICE_SESSION:
        return f"You've used all {limit} voice sessions this month. Upgrade to Premium for unlimited."
    if feature == PLAN_GENERATION:
        return "You've used your free plan generation. Upgrade to build new plans anytime."
    return "You've reached the limit for this feature."


# ── FastAPI dependencies ─────────────────────────────────────────────────────


def require_tier(min_tier: Tier):
    """
    Dependency factory gating a route behind a minimum tier.

        @router.post("/thing", dependencies=[Depends(require_tier("premium"))])

    Use `require_quota` instead when the feature is metered — this one only
    answers "is it available at all".
    """

    async def dependency(
        user_id: str = Depends(get_current_user_id),
        db: AsyncClient = Depends(get_db),
    ) -> Tier:
        tier = await store.tier_for_user(user_id, db)
        if not meets(tier, min_tier):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "upgrade_required",
                    "current_tier": tier,
                    "required_tier": min_tier,
                    "message": f"This is a {min_tier.capitalize()} feature.",
                },
            )
        return tier

    return dependency


def require_quota(feature: str):
    """
    Dependency factory for a metered feature. Checks only — the route calls
    `consume_quota` once the work has actually succeeded.
    """

    async def dependency(
        user_id: str = Depends(get_current_user_id),
        db: AsyncClient = Depends(get_db),
    ) -> Tier:
        try:
            tier, _ = await check_quota(feature, user_id, db)
        except QuotaExceeded as exc:
            raise exc.as_http() from exc
        return tier

    return dependency

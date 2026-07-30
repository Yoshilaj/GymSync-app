"""
What a customer is entitled to, derived from their transaction history.

Deliberately pure: `compute_entitlement` takes rows and a clock and returns an
answer. No database, no network, no settings. That is what lets the rules below
— every one of which is a way to get billing wrong — be tested exhaustively
without fixtures.

The entitlement is never stored. A cached "is_premium" flag is precisely the
thing that survives a refund and keeps serving paid features for free.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Literal

Tier = Literal["free", "pro", "premium"]
Period = Literal["monthly", "yearly"]

# Mirrors src/screens/pricing/catalog.ts. Product IDs are a contract with Apple
# and immutable once created, so they are written out rather than derived.
PRO_MONTHLY = "com.yoshinishikawahara.gymsync.pro.monthly"
PRO_YEARLY = "com.yoshinishikawahara.gymsync.pro.yearly"
PREMIUM_MONTHLY = "com.yoshinishikawahara.gymsync.premium.monthly"
PREMIUM_YEARLY = "com.yoshinishikawahara.gymsync.premium.yearly"

PRODUCTS: dict[str, tuple[Tier, Period]] = {
    PRO_MONTHLY: ("pro", "monthly"),
    PRO_YEARLY: ("pro", "yearly"),
    PREMIUM_MONTHLY: ("premium", "monthly"),
    PREMIUM_YEARLY: ("premium", "yearly"),
}

TIER_RANK: dict[Tier, int] = {"free": 0, "pro": 1, "premium": 2}

AUTO_RENEWABLE = "Auto-Renewable Subscription"
FAMILY_SHARED = "FAMILY_SHARED"
FREE_TRIAL = "FREE_TRIAL"
INTRODUCTORY_OFFER = 1

# A renewal lands a moment after the previous period ends. Without a little
# slack, a customer refreshing across that boundary blinks to Free and back —
# which reads as "the app lost my subscription".
EXPIRY_SKEW = timedelta(seconds=60)


@dataclass(frozen=True)
class Entitlement:
    """Mirrors the `Entitlement` interface in src/api/billing.ts."""

    tier: Tier = "free"
    period: Period | None = None
    # Named for the client contract. It is really "current period end" — whether
    # that date is a renewal or an expiry lives in Apple's renewal info, which a
    # client-supplied transaction does not carry.
    renews_at: datetime | None = None
    in_trial: bool = False
    product_id: str | None = None

    def to_api(self) -> dict[str, Any]:
        return {
            "tier": self.tier,
            "period": self.period,
            "renewsAt": self.renews_at.isoformat() if self.renews_at else None,
            "inTrial": self.in_trial,
            "productId": self.product_id,
            "isStub": False,
        }


FREE = Entitlement()


def tier_for_product(product_id: str) -> tuple[Tier, Period] | None:
    return PRODUCTS.get(product_id)


def _as_datetime(value: Any) -> datetime | None:
    """Postgres timestamptz arrives as ISO text over PostgREST; tests pass datetimes."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def is_trial_row(row: dict[str, Any]) -> bool:
    """
    A free trial, as opposed to any other introductory offer.

    offerType == 1 covers all three introductory kinds, and two of them
    (pay-as-you-go, pay-up-front) charge money. Calling those a "free trial" in
    the UI is both a lie to the customer and a disclosure problem at review, so
    the discount type has to agree.
    """
    return row.get("raw_offer_type") == INTRODUCTORY_OFFER and (
        row.get("raw_offer_discount_type") == FREE_TRIAL
    )


def _is_candidate(row: dict[str, Any], now: datetime) -> bool:
    # Only auto-renewable subscriptions grant a tier. Nothing else is sold today,
    # so anything else here is data we don't understand — exclude it.
    if (row.get("raw_type") or AUTO_RENEWABLE) != AUTO_RENEWABLE:
        return False

    # Family Sharing is not enabled in App Store Connect, so this cannot occur.
    # Filtered explicitly anyway: if it is ever switched on, the behaviour should
    # be a decision someone made, not an accident of what the code happened to do.
    if row.get("raw_ownership_type") == FAMILY_SHARED:
        return False

    # Refunded or revoked. (Apple can also revoke *partially* — the payload now
    # carries revocationType/revocationPercentage — but any revocation is treated
    # as full here, which errs toward not serving paid features for free.)
    if _as_datetime(row.get("revoked_at")) is not None:
        return False

    # THE upgrade rule. Apple marks the superseded row when a plan change
    # happens, and honouring that flag resolves upgrades correctly without
    # depending on Apple having already rewritten the old row's expiry — which
    # is not reliable across every path a plan change can take.
    if row.get("is_upgraded"):
        return False

    if row.get("product_id") not in PRODUCTS:
        return False

    expires_at = _as_datetime(row.get("expires_at"))
    if expires_at is None:
        return False
    return expires_at > now - EXPIRY_SKEW


def _sort_key(row: dict[str, Any]) -> tuple[int, float, float, str]:
    """
    Total ordering over candidates, best last.

    Tier first — a customer holding both Premium and Pro gets Premium, never the
    most recent. Never the sum of the two, either.

    The trailing purchase date and transaction ID are not decoration: tier plus
    expiry alone is not a total order, and two rows sharing both (trivial to
    produce in a .storekit file, where dates can land on the same millisecond)
    would make the winner depend on input order and the tests flaky.
    """
    tier, _ = PRODUCTS[row["product_id"]]
    expires_at = _as_datetime(row.get("expires_at"))
    purchased_at = _as_datetime(row.get("purchased_at"))
    return (
        TIER_RANK[tier],
        expires_at.timestamp() if expires_at else 0.0,
        purchased_at.timestamp() if purchased_at else 0.0,
        str(row.get("transaction_id") or ""),
    )


def compute_entitlement(
    rows: Iterable[dict[str, Any]],
    now: datetime | None = None,
) -> Entitlement:
    """
    The authoritative entitlement for one customer.

    Not handled here, and intentionally:

    • Downgrades. A downgrade takes effect at the next renewal and produces no
      transaction until then, so the current (higher) row stays valid until it
      expires — which is exactly right. "Premium until March, then Pro" is
      advisory copy the client reads from StoreKit's renewal info.

    • Grace period and billing retry. Both live in Apple's renewal info, which a
      client-submitted transaction does not include, so the server cannot see
      them. Consequence, stated plainly: a failed card drops someone to Free
      immediately while Apple still shows them subscribed, for up to 16 days.
      The fix is the App Store Server API once App Store Connect exists — NOT a
      blind grace window here, which would over-grant on every genuine lapse
      with no signal to ever take it back.
    """
    now = now or datetime.now(timezone.utc)

    candidates = [r for r in rows if _is_candidate(r, now)]
    if not candidates:
        return FREE

    winner = max(candidates, key=_sort_key)
    tier, period = PRODUCTS[winner["product_id"]]

    return Entitlement(
        tier=tier,
        period=period,
        renews_at=_as_datetime(winner.get("expires_at")),
        in_trial=is_trial_row(winner),
        product_id=winner["product_id"],
    )


def meets(current: Tier, required: Tier) -> bool:
    """Does `current` satisfy a `required` minimum tier?"""
    return TIER_RANK[current] >= TIER_RANK[required]

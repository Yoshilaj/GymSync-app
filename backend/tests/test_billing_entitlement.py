"""
Entitlement derivation (no network, no DB).

`compute_entitlement` is pure, so every way billing can go wrong is reachable
here as a plain dict. These are the tests that matter most in the whole
subscription feature: each one is a rule that, if broken, either bills someone
for nothing or serves paid features for free.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.billing.entitlement import (
    PREMIUM_MONTHLY,
    PREMIUM_YEARLY,
    PRO_MONTHLY,
    PRO_YEARLY,
    compute_entitlement,
    meets,
)

NOW = datetime(2026, 7, 30, 12, 0, tzinfo=timezone.utc)
LATER = NOW + timedelta(days=30)
EARLIER = NOW - timedelta(days=30)


def tx(product_id=PRO_MONTHLY, **over):
    """A verified, active, unremarkable transaction. Tests override one thing."""
    row = {
        "transaction_id": "t1",
        "product_id": product_id,
        "purchased_at": EARLIER,
        "expires_at": LATER,
        "revoked_at": None,
        "raw_type": "Auto-Renewable Subscription",
        "raw_ownership_type": "PURCHASED",
        "raw_offer_type": None,
        "raw_offer_discount_type": None,
        "is_upgraded": False,
    }
    row.update(over)
    return row


# ── The happy paths ──────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "product_id,tier,period",
    [
        (PRO_MONTHLY, "pro", "monthly"),
        (PRO_YEARLY, "pro", "yearly"),
        (PREMIUM_MONTHLY, "premium", "monthly"),
        (PREMIUM_YEARLY, "premium", "yearly"),
    ],
)
def test_each_sku_maps_to_its_tier_and_period(product_id, tier, period):
    ent = compute_entitlement([tx(product_id)], NOW)
    assert (ent.tier, ent.period) == (tier, period)
    assert ent.product_id == product_id


def test_no_transactions_is_free():
    assert compute_entitlement([], NOW).tier == "free"


# ── Everything that must NOT grant access ────────────────────────────────────


def test_expired_is_free():
    assert compute_entitlement([tx(expires_at=EARLIER)], NOW).tier == "free"


def test_revoked_is_free():
    """A refund must remove access. The single most expensive rule to get wrong."""
    assert compute_entitlement([tx(revoked_at=NOW)], NOW).tier == "free"


def test_upgraded_row_is_ignored():
    """
    Apple marks the SUPERSEDED row when a plan changes. Honouring that is what
    makes an upgrade resolve to the new tier without waiting for Apple to
    rewrite the old row's expiry.
    """
    assert compute_entitlement([tx(is_upgraded=True)], NOW).tier == "free"


def test_unknown_product_is_ignored():
    assert compute_entitlement([tx("com.someone.else.pro")], NOW).tier == "free"


def test_non_subscription_type_is_ignored():
    assert compute_entitlement([tx(raw_type="Consumable")], NOW).tier == "free"


def test_family_shared_is_ignored():
    assert compute_entitlement([tx(raw_ownership_type="FAMILY_SHARED")], NOW).tier == "free"


def test_missing_expiry_is_ignored():
    assert compute_entitlement([tx(expires_at=None)], NOW).tier == "free"


# ── Precedence ───────────────────────────────────────────────────────────────


def test_premium_wins_over_pro_regardless_of_recency():
    """
    Highest TIER wins, never the most recent purchase and never a sum. A newer
    Pro row must not demote an active Premium subscription.
    """
    premium = tx(PREMIUM_YEARLY, transaction_id="old", purchased_at=EARLIER - timedelta(days=60))
    newer_pro = tx(PRO_MONTHLY, transaction_id="new", purchased_at=NOW)
    assert compute_entitlement([premium, newer_pro], NOW).tier == "premium"
    assert compute_entitlement([newer_pro, premium], NOW).tier == "premium"


def test_upgrade_window_resolves_to_the_new_tier():
    """Mid-upgrade: the old Pro row is flagged, the new Premium row is live."""
    old_pro = tx(PRO_MONTHLY, transaction_id="1", is_upgraded=True)
    new_premium = tx(PREMIUM_MONTHLY, transaction_id="2")
    assert compute_entitlement([old_pro, new_premium], NOW).tier == "premium"


def test_identical_tier_and_expiry_is_deterministic():
    """
    Tier + expiry alone is not a total order, and .storekit files produce
    identical timestamps easily. Same input in any order -> same answer.
    """
    a = tx(PRO_MONTHLY, transaction_id="aaa")
    b = tx(PRO_YEARLY, transaction_id="bbb", expires_at=LATER, purchased_at=EARLIER)
    assert compute_entitlement([a, b], NOW) == compute_entitlement([b, a], NOW)


def test_later_expiry_wins_within_a_tier():
    near = tx(PRO_MONTHLY, transaction_id="1", expires_at=NOW + timedelta(days=1))
    far = tx(PRO_YEARLY, transaction_id="2", expires_at=NOW + timedelta(days=300))
    assert compute_entitlement([near, far], NOW).period == "yearly"


# ── Renewal boundary ─────────────────────────────────────────────────────────


def test_just_expired_still_counts_within_skew():
    """A refresh landing seconds after renewal must not blink the user to Free."""
    assert compute_entitlement([tx(expires_at=NOW - timedelta(seconds=10))], NOW).tier == "pro"


def test_expired_beyond_skew_does_not_count():
    assert compute_entitlement([tx(expires_at=NOW - timedelta(minutes=5))], NOW).tier == "free"


# ── Trial detection ──────────────────────────────────────────────────────────


def test_free_trial_sets_in_trial():
    ent = compute_entitlement([tx(raw_offer_type=1, raw_offer_discount_type="FREE_TRIAL")], NOW)
    assert ent.in_trial is True


@pytest.mark.parametrize("discount", ["PAY_AS_YOU_GO", "PAY_UP_FRONT"])
def test_paid_introductory_offers_are_not_trials(discount):
    """
    offerType == 1 covers all introductory offers, and two of them CHARGE.
    Calling those a free trial misleads the customer and is a disclosure problem
    at App Review.
    """
    ent = compute_entitlement([tx(raw_offer_type=1, raw_offer_discount_type=discount)], NOW)
    assert ent.in_trial is False


def test_ordinary_renewal_is_not_a_trial():
    assert compute_entitlement([tx()], NOW).in_trial is False


# ── Input handling ───────────────────────────────────────────────────────────


def test_iso_strings_parse_like_datetimes():
    """PostgREST returns timestamptz as ISO text; the rules must not care."""
    row = tx(expires_at=LATER.isoformat(), purchased_at=EARLIER.isoformat())
    assert compute_entitlement([row], NOW).tier == "pro"


def test_zulu_suffix_parses():
    row = tx(expires_at=LATER.isoformat().replace("+00:00", "Z"))
    assert compute_entitlement([row], NOW).tier == "pro"


def test_naive_datetime_is_treated_as_utc():
    assert compute_entitlement([tx(expires_at=LATER.replace(tzinfo=None))], NOW).tier == "pro"


# ── API shape ────────────────────────────────────────────────────────────────


def test_api_payload_matches_the_client_contract():
    """Keys here are consumed by src/api/billing.ts — camelCase, and isStub false."""
    payload = compute_entitlement([tx(PREMIUM_YEARLY)], NOW).to_api()
    assert set(payload) == {"tier", "period", "renewsAt", "inTrial", "productId", "isStub"}
    assert payload["isStub"] is False
    assert payload["renewsAt"].startswith("2026-08-29")


def test_free_payload_has_no_period_or_date():
    payload = compute_entitlement([], NOW).to_api()
    assert (payload["tier"], payload["period"], payload["renewsAt"]) == ("free", None, None)


# ── Tier comparison ──────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "current,required,ok",
    [
        ("free", "free", True),
        ("free", "pro", False),
        ("free", "premium", False),
        ("pro", "free", True),
        ("pro", "pro", True),
        ("pro", "premium", False),
        ("premium", "pro", True),
        ("premium", "premium", True),
    ],
)
def test_meets(current, required, ok):
    assert meets(current, required) is ok

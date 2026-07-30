"""
Ownership binding, monotonic upserts and metered quotas (no network, real logic
against an in-memory PostgREST stand-in).

Ownership is the half of billing that decides WHOSE subscription this is, and
every case below is either a paying customer who must not be locked out or an
account that must not be able to claim someone else's purchase.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.billing import store
from app.billing.entitlement import PREMIUM_YEARLY, PRO_MONTHLY
from app.entitlements import (
    CHAT_MESSAGE,
    PLAN_GENERATION,
    VOICE_SESSION,
    QuotaExceeded,
    check_quota,
    consume_quota,
    period_key,
    period_reset,
)
from tests.fake_supabase import FakeDB

USER_A = str(uuid.uuid4())
USER_B = str(uuid.uuid4())

# Anchored to the real clock, because the entitlement rules compare against
# datetime.now(). A hardcoded constant here would quietly become an "expired"
# fixture the moment it drifted into the past, and the tests would assert Free
# while looking like they were testing a live subscription.
NOW_MS = int(datetime.now(timezone.utc).timestamp() * 1000)


class FakePayload:
    """The handful of JWSTransactionDecodedPayload fields store.py reads."""

    def __init__(self, **over):
        self.transactionId = "t1"
        self.originalTransactionId = "o1"
        self.rawEnvironment = "Xcode"
        self.appAccountToken = None
        self.productId = PRO_MONTHLY
        self.bundleId = "com.yoshinishikawahara.gymsync"
        self.subscriptionGroupIdentifier = "21000000"
        self.purchaseDate = NOW_MS
        self.originalPurchaseDate = NOW_MS
        self.expiresDate = NOW_MS + 30 * 86_400_000
        self.revocationDate = None
        self.rawType = "Auto-Renewable Subscription"
        self.rawInAppOwnershipType = "PURCHASED"
        self.rawRevocationReason = None
        self.rawOfferType = None
        self.rawOfferDiscountType = None
        self.offerIdentifier = None
        self.isUpgraded = False
        self.signedDate = NOW_MS
        self.webOrderLineItemId = "w1"
        self.quantity = 1
        self.rawTransactionReason = "PURCHASE"
        self.currency = "USD"
        self.price = 14990
        self.rawRevocationType = None
        self.revocationPercentage = None
        self.storefront = "USA"
        for k, v in over.items():
            setattr(self, k, v)


@pytest.fixture
def db():
    return FakeDB()


# ── Ownership binding ────────────────────────────────────────────────────────


async def test_matching_token_binds_to_the_caller(db):
    owner = await store.resolve_owner(FakePayload(appAccountToken=USER_A), USER_A, db)
    assert owner == USER_A
    assert db.tables["apple_subscription_owners"][0]["bind_reason"] == "token"


async def test_token_comparison_ignores_case_and_formatting(db):
    """
    StoreKit gives no guarantee about the case it round-trips a UUID in, so
    string comparison would reject a customer's own token. Parsed comparison is
    the only correct test.
    """
    owner = await store.resolve_owner(
        FakePayload(appAccountToken=USER_A.upper()), USER_A, db
    )
    assert owner == USER_A


async def test_token_naming_another_LIVE_account_is_a_conflict(db):
    """
    The token is evidence. While the account it names still exists, that
    account owns the subscription — even before it has verified anything.
    """
    with pytest.raises(store.OwnershipConflict):
        await store.resolve_owner(FakePayload(appAccountToken=USER_B), USER_A, db)


async def test_second_account_cannot_take_a_bound_subscription(db):
    """One Apple subscription, two GymSync accounts — the shared-phone case."""
    await store.resolve_owner(FakePayload(appAccountToken=USER_A), USER_A, db)
    with pytest.raises(store.OwnershipConflict):
        await store.resolve_owner(FakePayload(appAccountToken=None), USER_B, db)


async def test_rebinding_your_own_subscription_is_fine(db):
    """Reinstall and restore: same account, same subscription, no drama."""
    await store.resolve_owner(FakePayload(appAccountToken=USER_A), USER_A, db)
    owner = await store.resolve_owner(FakePayload(appAccountToken=None), USER_A, db)
    assert owner == USER_A
    assert len(db.tables["apple_subscription_owners"]) == 1


async def test_untokened_purchase_binds_when_the_user_has_none(db):
    """
    App-Store-initiated resubscribe or a promo-code redemption on a fresh
    install: no appAccountToken exists, and refusing would strand a customer who
    genuinely paid.
    """
    owner = await store.resolve_owner(FakePayload(appAccountToken=None), USER_A, db)
    assert owner == USER_A
    assert db.tables["apple_subscription_owners"][0]["bind_reason"] == "inferred"


async def test_untokened_claim_is_refused_when_the_user_already_has_one(db):
    """
    The land-grab guard. Without it, anyone holding one subscription could claim
    every unclaimed subscription they can produce a transaction for.
    """
    await store.resolve_owner(FakePayload(appAccountToken=USER_A), USER_A, db)
    with pytest.raises(store.OwnershipConflict):
        await store.resolve_owner(
            FakePayload(originalTransactionId="other", appAccountToken=None), USER_A, db
        )


async def test_family_shared_never_binds(db):
    """
    Family members legitimately share the purchaser's originalTransactionId, so
    binding would lock out everyone but whoever opened the app first.
    """
    payload = FakePayload(rawInAppOwnershipType="FAMILY_SHARED", appAccountToken=None)
    assert await store.resolve_owner(payload, USER_A, db) == USER_A
    assert await store.resolve_owner(payload, USER_B, db) == USER_B
    assert db.tables["apple_subscription_owners"] == []


async def test_deleting_your_account_does_not_forfeit_your_subscription(db):
    """
    Delete the account, sign up again, restore — and get your subscription back.

    Apple's transaction carries the OLD user id in appAccountToken forever, and
    account deletion cascades the binding away. Rejecting on the token mismatch
    would 409, the client would treat that as permanent and finish the
    transaction, and a customer would be left paying for access they can no
    longer reach.
    """
    await store.resolve_owner(FakePayload(appAccountToken=USER_A), USER_A, db)

    # Account deleted: the auth user is gone and the FK cascade takes the
    # binding with it.
    db.deleted_users.add(USER_A)
    db.tables["apple_subscription_owners"].clear()

    # Same Apple subscription, new GymSync account, stale token.
    owner = await store.resolve_owner(FakePayload(appAccountToken=USER_A), USER_B, db)
    assert owner == USER_B
    assert db.tables["apple_subscription_owners"][0]["bind_reason"] == "inferred"


async def test_a_live_subscription_still_cannot_be_stolen(db):
    """
    The other half of the rule above: while the original owner still exists,
    their binding row refuses everyone else — whatever the token says.
    """
    await store.resolve_owner(FakePayload(appAccountToken=USER_A), USER_A, db)
    with pytest.raises(store.OwnershipConflict):
        await store.resolve_owner(FakePayload(appAccountToken=USER_A), USER_B, db)


async def test_a_concurrent_claim_cannot_steal_the_binding(db):
    """
    Two accounts claiming the same unbound subscription at the same moment.

    The ownership check is a read and the bind is a write, so another request
    can land between them. With an upsert the second writer OVERWRITES the
    first — both "succeed" and the later one silently steals the subscription.
    An insert lets the primary key reject the loser instead.

    Simulated by making the existence check come back empty (as it would in the
    race) while the row is really there.
    """
    # The rival already bound it; our request's read missed it.
    db.tables["apple_subscription_owners"].append(
        {
            "environment": "Xcode",
            "original_transaction_id": "o1",
            "user_id": USER_B,
            "bind_reason": "token",
        }
    )
    db.blind_selects.add("apple_subscription_owners")

    with pytest.raises(store.OwnershipConflict):
        await store.resolve_owner(FakePayload(appAccountToken=USER_A), USER_A, db)

    # And the rival's binding is intact, not overwritten.
    rows = db.tables["apple_subscription_owners"]
    assert len(rows) == 1
    assert rows[0]["user_id"] == USER_B


async def test_losing_a_race_against_yourself_is_not_an_error(db):
    """A retry of our own request must resolve to us, not 409."""
    db.tables["apple_subscription_owners"].append(
        {
            "environment": "Xcode",
            "original_transaction_id": "o1",
            "user_id": USER_A,
            "bind_reason": "token",
        }
    )
    db.blind_selects.add("apple_subscription_owners")

    assert await store.resolve_owner(FakePayload(appAccountToken=USER_A), USER_A, db) == USER_A


async def test_refunding_an_old_renewal_keeps_the_current_one(db):
    """
    A refunded renewal from three months ago must not revoke a subscription
    that has renewed since. Access derives from the CURRENT period's row, not
    from "has this customer ever had a refund".
    """
    old = store.payload_to_row(
        FakePayload(
            transactionId="old",
            purchaseDate=NOW_MS - 90 * 86_400_000,
            expiresDate=NOW_MS - 60 * 86_400_000,
            revocationDate=NOW_MS - 30 * 86_400_000,
        ),
        USER_A,
    )
    current = store.payload_to_row(FakePayload(transactionId="current"), USER_A)
    await store.upsert_transaction(old, db)
    await store.upsert_transaction(current, db)

    assert (await store.tier_for_user(USER_A, db)) == "pro"


async def test_same_transaction_id_in_two_environments_does_not_collide(db):
    """
    Sandbox and Xcode hand out ids like '0' and '1' per device, so the composite
    key is what stops one tester's transaction from overwriting another's.
    """
    await store.resolve_owner(
        FakePayload(originalTransactionId="0", rawEnvironment="Xcode", appAccountToken=USER_A),
        USER_A,
        db,
    )
    await store.resolve_owner(
        FakePayload(originalTransactionId="0", rawEnvironment="Sandbox", appAccountToken=USER_B),
        USER_B,
        db,
    )
    assert len(db.tables["apple_subscription_owners"]) == 2


# ── Transaction rows ─────────────────────────────────────────────────────────


def test_payload_to_row_maps_product_to_tier_and_period():
    row = store.payload_to_row(FakePayload(productId=PREMIUM_YEARLY), USER_A)
    assert (row["tier"], row["period"]) == ("premium", "yearly")
    assert row["user_id"] == USER_A


def test_payload_to_row_rejects_an_unknown_product():
    with pytest.raises(store.UnknownProduct):
        store.payload_to_row(FakePayload(productId="com.someone.else"), USER_A)


def test_payload_to_row_keeps_the_raw_payload():
    """The cheapest insurance available when a question outlives the columns."""
    row = store.payload_to_row(FakePayload(), USER_A)
    assert row["raw"]["bundleId"] == "com.yoshinishikawahara.gymsync"
    assert row["raw"]["webOrderLineItemId"] == "w1"


def test_payload_to_row_converts_apple_milliseconds():
    """
    Apple sends epoch MILLIseconds. Feeding those to a seconds-based constructor
    lands ~55,000 years in the future, which would make every subscription look
    permanently active — so this asserts the value round-trips to the instant it
    came from, not merely that it parses.
    """
    row = store.payload_to_row(FakePayload(), USER_A)
    purchased = datetime.fromisoformat(row["purchased_at"])
    assert abs((purchased - datetime.now(timezone.utc)).total_seconds()) < 5
    assert row["expires_at"] > row["purchased_at"]


# ── Monotonic upsert ─────────────────────────────────────────────────────────


async def test_first_write_is_stored(db):
    assert await store.upsert_transaction(store.payload_to_row(FakePayload(), USER_A), db)
    assert len(db.tables["apple_transactions"]) == 1


async def test_replay_of_the_same_state_is_accepted_idempotently(db):
    row = store.payload_to_row(FakePayload(), USER_A)
    await store.upsert_transaction(row, db)
    assert await store.upsert_transaction(row, db) is True
    assert len(db.tables["apple_transactions"]) == 1


async def test_newer_state_overwrites(db):
    """A refund arriving after the purchase must land."""
    await store.upsert_transaction(store.payload_to_row(FakePayload(), USER_A), db)
    refunded = store.payload_to_row(
        FakePayload(signedDate=NOW_MS + 5000, revocationDate=NOW_MS + 5000), USER_A
    )
    assert await store.upsert_transaction(refunded, db)
    assert db.tables["apple_transactions"][0]["revoked_at"] is not None


async def test_stale_replay_cannot_resurrect_a_refunded_subscription(db):
    """
    THE reason the upsert is monotonic. StoreKit replays the original purchase
    on every launch; if that replay overwrote a recorded refund, access would
    come back every time the app opened.
    """
    await store.upsert_transaction(
        store.payload_to_row(
            FakePayload(signedDate=NOW_MS + 5000, revocationDate=NOW_MS + 5000), USER_A
        ),
        db,
    )
    stale = store.payload_to_row(FakePayload(signedDate=NOW_MS), USER_A)
    assert await store.upsert_transaction(stale, db) is False
    assert db.tables["apple_transactions"][0]["revoked_at"] is not None


async def test_missing_signed_date_falls_back_to_purchase_date(db):
    """signedDate is optional in the payload; comparing None would throw."""
    row = store.payload_to_row(FakePayload(signedDate=None), USER_A)
    assert await store.upsert_transaction(row, db)


# ── Entitlement through the store ────────────────────────────────────────────


async def test_entitlement_reads_only_the_owner_rows(db):
    await store.upsert_transaction(store.payload_to_row(FakePayload(), USER_A), db)
    assert (await store.tier_for_user(USER_A, db)) == "pro"
    assert (await store.tier_for_user(USER_B, db)) == "free"


async def test_a_refund_removes_access(db):
    """
    The whole refund path, end to end through the store.

    Worth stating why this can only work because the client asks StoreKit for
    the FULL transaction history: a revoked transaction is not "currently
    active", so an active-only reconcile would never hand this row back and the
    refund would be invisible until the period lapsed on its own.
    """
    await store.upsert_transaction(store.payload_to_row(FakePayload(), USER_A), db)
    assert (await store.tier_for_user(USER_A, db)) == "pro"

    refunded = store.payload_to_row(
        FakePayload(signedDate=NOW_MS + 1000, revocationDate=NOW_MS + 1000), USER_A
    )
    await store.upsert_transaction(refunded, db)
    assert (await store.tier_for_user(USER_A, db)) == "free"


# ── Quotas ───────────────────────────────────────────────────────────────────


async def test_free_user_cannot_start_a_voice_session(db):
    with pytest.raises(QuotaExceeded) as exc:
        await check_quota(VOICE_SESSION, USER_A, db, tier="free")
    assert exc.value.code == "upgrade_required"
    assert exc.value.required_tier == "pro"


async def test_pro_gets_ten_voice_sessions_then_stops(db):
    for i in range(10):
        tier, remaining = await check_quota(VOICE_SESSION, USER_A, db, tier="pro")
        assert remaining == 10 - i
        await store.increment_usage(USER_A, VOICE_SESSION, period_key("month"), db)

    with pytest.raises(QuotaExceeded) as exc:
        await check_quota(VOICE_SESSION, USER_A, db, tier="pro")
    assert exc.value.code == "quota_exhausted"
    assert (exc.value.limit, exc.value.used) == (10, 10)
    # Points at Premium, so the prompt opens on the tier that actually helps.
    assert exc.value.required_tier == "premium"


async def test_premium_voice_is_unmetered(db):
    for _ in range(50):
        await store.increment_usage(USER_A, VOICE_SESSION, period_key("month"), db)
    _, remaining = await check_quota(VOICE_SESSION, USER_A, db, tier="premium")
    assert remaining == -1


async def test_free_chat_stops_at_ten_a_day(db):
    for _ in range(10):
        await check_quota(CHAT_MESSAGE, USER_A, db, tier="free")
        await store.increment_usage(USER_A, CHAT_MESSAGE, period_key("day"), db)

    with pytest.raises(QuotaExceeded) as exc:
        await check_quota(CHAT_MESSAGE, USER_A, db, tier="free")
    assert exc.value.code == "quota_exhausted"
    # Daily, so the prompt can honestly promise it comes back.
    assert exc.value.resets_at is not None


async def test_a_new_day_restores_free_chat(db):
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    for _ in range(10):
        await store.increment_usage(USER_A, CHAT_MESSAGE, yesterday, db)
    _, remaining = await check_quota(CHAT_MESSAGE, USER_A, db, tier="free")
    assert remaining == 10


async def test_free_plan_generation_is_once_ever(db):
    await check_quota(PLAN_GENERATION, USER_A, db, tier="free")
    await store.increment_usage(USER_A, PLAN_GENERATION, "all", db)

    with pytest.raises(QuotaExceeded) as exc:
        await check_quota(PLAN_GENERATION, USER_A, db, tier="free")
    # Lifetime never resets, and the prompt must not imply it will.
    assert exc.value.resets_at is None


async def test_consume_does_not_count_unlimited_tiers(db):
    """Otherwise this becomes the busiest table in the database, for nothing."""
    await store.upsert_transaction(
        store.payload_to_row(FakePayload(productId=PREMIUM_YEARLY), USER_A), db
    )
    await consume_quota(CHAT_MESSAGE, USER_A, db)
    assert db.tables["feature_usage"] == []


async def test_increment_is_atomic_per_bucket(db):
    counts = [
        await store.increment_usage(USER_A, VOICE_SESSION, "2026-07", db) for _ in range(3)
    ]
    assert counts == [1, 2, 3]


def test_period_keys_are_distinct_buckets():
    now = datetime(2026, 7, 30, 12, tzinfo=timezone.utc)
    assert period_key("day", now) == "2026-07-30"
    assert period_key("month", now) == "2026-07"
    assert period_key("lifetime", now) == "all"


def test_month_rollover_crosses_the_year_boundary():
    """December must roll to January, not to month 13."""
    assert period_reset("month", datetime(2026, 12, 15, tzinfo=timezone.utc)).startswith(
        "2027-01-01"
    )


def test_quota_detail_carries_what_a_paywall_prompt_needs():
    exc = QuotaExceeded(
        code="quota_exhausted",
        feature=VOICE_SESSION,
        current_tier="pro",
        required_tier="premium",
        limit=10,
        used=10,
        resets_at="2026-08-01T00:00:00+00:00",
        message="…",
    )
    detail = exc.detail()
    assert detail["code"] == "quota_exhausted"
    assert detail["required_tier"] == "premium"
    assert detail["limit"] == 10
    assert exc.as_http().status_code == 403

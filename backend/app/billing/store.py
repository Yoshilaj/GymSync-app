"""
Reads and writes for the billing tables — the ONE code path that touches
apple_transactions, apple_subscription_owners and feature_usage.

Consumers: routers/billing.py (verify + entitlement), app/entitlements.py
(tier checks and quotas).

Same shape as plan_store.py: module-level async functions taking `db`, no
classes. The service-role key bypasses RLS, so every query here carries an
explicit `.eq("user_id", ...)` — that filter IS the tenant boundary, not a
convenience.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from appstoreserverlibrary.models.JWSTransactionDecodedPayload import (
    JWSTransactionDecodedPayload,
)
from supabase import AsyncClient

from app.billing.entitlement import (
    Entitlement,
    Tier,
    compute_entitlement,
    tier_for_product,
)


log = logging.getLogger(__name__)


class OwnershipConflict(Exception):
    """This Apple subscription already belongs to a different GymSync account."""


class UnknownProduct(Exception):
    """A verified transaction for a product we don't sell."""


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ms_to_iso(ms: int | None) -> str | None:
    """Apple sends epoch milliseconds; Postgres wants ISO."""
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def _parse_uuid(value: Any) -> uuid.UUID | None:
    """
    Parse leniently, compare strictly.

    appAccountToken round-trips through StoreKit with no guarantee about case or
    hyphenation, so comparing the strings would reject a customer's own token.
    Comparing parsed UUIDs is the only correct test.
    """
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


# ── Ownership ────────────────────────────────────────────────────────────────


async def _user_exists(user_id: str, db: AsyncClient) -> bool:
    """
    Does this auth user still exist?

    Distinguishes "the token names someone else" (refuse) from "the token names
    an account that was deleted" (the subscription is genuinely unclaimed).
    Without that distinction, ownership is either too strict — a customer who
    deletes their account can never reach their subscription again — or too
    loose.

    Errs toward EXISTS on an unexpected failure: the caller treats True as
    "refuse", so a transient auth-API problem denies a claim rather than
    granting one it shouldn't.
    """
    try:
        res = await db.auth.admin.get_user_by_id(user_id)
        return bool(getattr(res, "user", None))
    except Exception as exc:  # noqa: BLE001
        message = str(exc).lower()
        if "not found" in message or "404" in message:
            return False
        return True


async def resolve_owner(
    payload: JWSTransactionDecodedPayload,
    user_id: str,
    db: AsyncClient,
) -> str:
    """
    Decide which account owns this subscription, binding it if it is unclaimed.

    Returns the owning user id. Raises OwnershipConflict when the subscription
    is already someone else's.

    The rules, and why each exists:

    • appAccountToken present and matching → the caller owns it, and may bind.
      This is the normal path: every in-app purchase sets the token.

    • appAccountToken present and NOT matching → conflict. Someone is
      submitting a transaction that names another account.

    • No token, already bound → must be the bound account. Absence of a token is
      not permission to take over a subscription.

    • No token, unbound, and the caller has no other subscription → bind, marked
      'inferred'. This is the narrow concession that keeps App-Store-initiated
      resubscribes and promo-code redemptions working; without it a customer who
      genuinely paid gets nothing. Requiring the caller to have no other
      subscription stops it from becoming a way to hoover up unclaimed ones.

    • Family Sharing → never bind, never enforce. Family members legitimately
      share the purchaser's originalTransactionId, so binding would lock out
      everyone but the first to open the app.
    """
    original_id = payload.originalTransactionId
    environment = payload.rawEnvironment
    caller = _parse_uuid(user_id)
    token = _parse_uuid(payload.appAccountToken)

    if payload.rawInAppOwnershipType == "FAMILY_SHARED":
        return user_id

    # THE BINDING TABLE IS THE AUTHORITY — checked before appAccountToken.
    #
    # Order matters here. Rejecting on a token mismatch first would lock a
    # customer out of a subscription they are still paying for: deleting a
    # GymSync account cascades its binding away, but Apple's transaction still
    # carries the OLD user id in appAccountToken forever. Re-registering would
    # mismatch, 409, and the client would finish the transaction as permanently
    # rejected — a paid subscription, unreachable, with no way back.
    #
    # Checking the binding first keeps the protection where it actually lives:
    # a live subscription always has a binding row (this function writes one on
    # first sight), so an impostor presenting someone else's transaction is
    # refused below regardless of what the token says.
    existing = (
        await db.table("apple_subscription_owners")
        .select("user_id")
        .eq("environment", environment)
        .eq("original_transaction_id", original_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        owner = existing.data[0]["user_id"]
        if _parse_uuid(owner) != caller:
            raise OwnershipConflict(
                "This subscription is already linked to another GymSync account."
            )
        return owner

    # Unclaimed: either never seen, or its previous owner deleted their account.
    if token is not None and caller is not None and token == caller:
        bind_reason = "token"
    elif token is not None and await _user_exists(str(token), db):
        # The token names a DIFFERENT account that still exists. That account
        # is the rightful owner even though it hasn't verified yet (its first
        # verify may simply have failed), so this caller may not take it.
        #
        # Only a token pointing at a DELETED account falls through to the
        # inferred path below — which is exactly the account-deletion recovery
        # case, and nothing wider.
        raise OwnershipConflict(
            "This subscription belongs to another GymSync account."
        )
    else:
        # No proof this caller started the purchase — the token is absent
        # (App-Store-initiated resubscribe, promo code) or names an account
        # that no longer exists. Allow the claim only if the caller holds no
        # other subscription, so this can't become a way to hoover up every
        # unclaimed subscription someone can produce a transaction for.
        others = (
            await db.table("apple_subscription_owners")
            .select("original_transaction_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if others.data:
            raise OwnershipConflict(
                "This subscription is not linked to your GymSync account."
            )
        bind_reason = "inferred"

    # INSERT, never upsert.
    #
    # The check above is a read, and this is the write — between them another
    # request can bind the same subscription to a different account. An upsert
    # would happily OVERWRITE that binding, so two concurrent claims would both
    # "succeed" and the later one would silently steal ownership. A plain insert
    # lets the primary key do its job: the loser gets a constraint violation
    # instead of a stolen subscription.
    try:
        await db.table("apple_subscription_owners").insert(
            {
                "environment": environment,
                "original_transaction_id": original_id,
                "user_id": user_id,
                "bind_reason": bind_reason,
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001 — PostgREST wraps the PK violation
        # Someone bound it first. Re-read and let the stored binding decide;
        # if it turns out to be us (a retry of our own request), that's fine.
        winner = (
            await db.table("apple_subscription_owners")
            .select("user_id")
            .eq("environment", environment)
            .eq("original_transaction_id", original_id)
            .limit(1)
            .execute()
        )
        if not winner.data:
            raise  # not a conflict — a real write failure, surface it
        owner = winner.data[0]["user_id"]
        if _parse_uuid(owner) != caller:
            raise OwnershipConflict(
                "This subscription is already linked to another GymSync account."
            ) from exc
        return owner

    log.info(
        "Bound Apple subscription %s/%s to %s (%s)",
        environment,
        original_id,
        user_id,
        bind_reason,
    )
    return user_id


# ── Transactions ─────────────────────────────────────────────────────────────


def payload_to_row(
    payload: JWSTransactionDecodedPayload, owner_id: str
) -> dict[str, Any]:
    """Flatten a verified payload into an apple_transactions row."""
    product = tier_for_product(payload.productId or "")
    if product is None:
        raise UnknownProduct(f"Unknown product {payload.productId!r}.")
    tier, period = product

    return {
        "environment": payload.rawEnvironment,
        "transaction_id": payload.transactionId,
        "original_transaction_id": payload.originalTransactionId,
        "user_id": owner_id,
        "app_account_token": str(_parse_uuid(payload.appAccountToken) or "") or None,
        "product_id": payload.productId,
        "tier": tier,
        "period": period,
        "purchased_at": _ms_to_iso(payload.purchaseDate),
        "expires_at": _ms_to_iso(payload.expiresDate),
        "revoked_at": _ms_to_iso(payload.revocationDate),
        "raw_type": payload.rawType,
        "raw_ownership_type": payload.rawInAppOwnershipType,
        "raw_revocation_reason": payload.rawRevocationReason,
        "raw_offer_type": payload.rawOfferType,
        "raw_offer_discount_type": payload.rawOfferDiscountType,
        "is_upgraded": bool(payload.isUpgraded),
        "signed_date": _ms_to_iso(payload.signedDate),
        "raw": {
            k: v
            for k, v in {
                "transactionId": payload.transactionId,
                "originalTransactionId": payload.originalTransactionId,
                "webOrderLineItemId": payload.webOrderLineItemId,
                "bundleId": payload.bundleId,
                "productId": payload.productId,
                "subscriptionGroupIdentifier": payload.subscriptionGroupIdentifier,
                "purchaseDate": payload.purchaseDate,
                "originalPurchaseDate": payload.originalPurchaseDate,
                "expiresDate": payload.expiresDate,
                "quantity": payload.quantity,
                "type": payload.rawType,
                "appAccountToken": payload.appAccountToken,
                "inAppOwnershipType": payload.rawInAppOwnershipType,
                "signedDate": payload.signedDate,
                "revocationReason": payload.rawRevocationReason,
                "revocationDate": payload.revocationDate,
                "isUpgraded": payload.isUpgraded,
                "offerType": payload.rawOfferType,
                "offerIdentifier": payload.offerIdentifier,
                "offerDiscountType": payload.rawOfferDiscountType,
                "environment": payload.rawEnvironment,
                "storefront": payload.storefront,
                "transactionReason": payload.rawTransactionReason,
                "currency": payload.currency,
                "price": payload.price,
                "revocationType": payload.rawRevocationType,
                "revocationPercentage": payload.revocationPercentage,
            }.items()
            if v is not None
        },
    }


def _effective_date(row: dict[str, Any]) -> str:
    """
    When this row's state was established.

    signedDate is nullable in the payload, so it falls back to the purchase
    date. Comparing against None would make every monotonicity check throw.
    """
    return row.get("signed_date") or row.get("purchased_at") or ""


async def upsert_transaction(row: dict[str, Any], db: AsyncClient) -> bool:
    """
    Store a verified transaction, newest state wins. Returns True if written.

    StoreKit replays unfinished transactions on every launch, and notifications
    (once they exist) arrive out of order. Both mean the same transaction shows
    up repeatedly, sometimes carrying STALER state than what is already stored —
    a replay of the original purchase after a refund has been recorded, say.
    Letting that write through would resurrect a refunded subscription.

    So a write whose effective date is older than the stored one is skipped, and
    that is a success, not a conflict: the caller has told us something we
    already knew, and must still get a 200 and the current entitlement.
    """
    existing = (
        await db.table("apple_transactions")
        .select("signed_date, purchased_at")
        .eq("environment", row["environment"])
        .eq("transaction_id", row["transaction_id"])
        .limit(1)
        .execute()
    )

    if existing.data and _effective_date(row) < _effective_date(existing.data[0]):
        return False

    await db.table("apple_transactions").upsert(
        {**row, "updated_at": _utcnow()},
        on_conflict="environment,transaction_id",
    ).execute()
    return True


async def transactions_for_user(user_id: str, db: AsyncClient) -> list[dict[str, Any]]:
    """
    The rows the entitlement is computed from.

    Deliberately unfiltered beyond the owner: every rule about what counts lives
    in entitlement.py, so there is one place to read and one place to test. SQL
    that also knew the rules would be a second, silently diverging copy.
    """
    res = (
        await db.table("apple_transactions")
        .select(
            "transaction_id, product_id, purchased_at, expires_at, revoked_at, "
            "raw_type, raw_ownership_type, raw_offer_type, raw_offer_discount_type, "
            "is_upgraded"
        )
        .eq("user_id", user_id)
        .execute()
    )
    return res.data or []


async def entitlement_for_user(user_id: str, db: AsyncClient) -> Entitlement:
    return compute_entitlement(await transactions_for_user(user_id, db))


async def tier_for_user(user_id: str, db: AsyncClient) -> Tier:
    return (await entitlement_for_user(user_id, db)).tier


# ── Metered usage ────────────────────────────────────────────────────────────


async def usage_count(
    user_id: str, feature: str, period_key: str, db: AsyncClient
) -> int:
    res = (
        await db.table("feature_usage")
        .select("count")
        .eq("user_id", user_id)
        .eq("feature", feature)
        .eq("period_key", period_key)
        .limit(1)
        .execute()
    )
    return res.data[0]["count"] if res.data else 0


async def increment_usage(
    user_id: str, feature: str, period_key: str, db: AsyncClient, delta: int = 1
) -> int:
    """
    Atomically bump a counter and return its new value.

    Goes through the SQL function rather than a read-then-write because
    PostgREST cannot express `count = count + 1`: two voice sessions started at
    once would both read 9, both write 10, and both slip past a cap of 10.
    """
    res = await db.rpc(
        "increment_feature_usage",
        {
            "p_user_id": user_id,
            "p_feature": feature,
            "p_period_key": period_key,
            "p_delta": delta,
        },
    ).execute()
    return res.data if isinstance(res.data, int) else 0

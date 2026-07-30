"""
Billing API — the server's answer to "what has this customer paid for?"

Two endpoints, both authenticated:

  GET  /api/billing/entitlement    what they're entitled to right now
  POST /api/billing/apple/verify   verify one Apple transaction, then say so

The client NEVER decides its own tier. It forwards Apple-signed data and is told
the result; the entitlement is recomputed from stored transactions on every read.

Not here yet: POST /api/billing/apple/notifications, for App Store Server
Notifications V2. It needs a public HTTPS URL and this backend isn't deployed
anywhere, so it could be neither reached nor tested — and it is exactly the code
that would be rewritten once real notifications start arriving. The schema
already holds the columns it will need. Until it exists, subscription changes
made while the app is closed are picked up on the next foreground refresh.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app.auth import get_current_user_id
from app.billing import store
from app.billing.apple import TransactionRejected, verify_transaction
from app.billing.store import OwnershipConflict, UnknownProduct
from app.database import get_db

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger(__name__)


class VerifyRequest(BaseModel):
    # expo-iap's `purchase.purchaseToken` — on iOS, the StoreKit 2 JWS.
    jws: str = Field(min_length=1)


@router.get("/entitlement")
async def get_entitlement(
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    entitlement = await store.entitlement_for_user(user_id, db)
    return entitlement.to_api()


@router.post("/apple/verify")
async def verify_apple_transaction(
    body: VerifyRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    """
    Verify one Apple transaction, store it, and return the resulting entitlement.

    The entitlement comes back in THIS response rather than making the client
    re-read it: a second round trip is a second chance to fail, and the failure
    shows the customer "Free" one second after they paid.

    On the client, this call succeeding is what authorizes `finishTransaction`.
    Until Apple's transaction is finished it will be replayed on every launch,
    which is the safety net for a response that never arrives.

    Idempotent by construction. A replay — of a transaction already stored, or
    one carrying older state than what's stored — is a 200 with the current
    entitlement, not a conflict. The client is telling us something we already
    know, and the only thing it needs back is the truth.
    """
    try:
        payload = verify_transaction(body.jws)
    except TransactionRejected as exc:
        # "Wrong environment" is almost always OUR mistake, not a bad purchase:
        # the server is pointed at Xcode while the customer is buying in Sandbox,
        # or at Sandbox in production. Reporting it as 422 tells the client the
        # transaction is permanently unusable, and the client then FINISHES it —
        # throwing away a real purchase because a config line was wrong.
        #
        # 503 says "we can't verify this right now", which the client treats as
        # retryable. The transaction stays unfinished, and the next reconcile
        # picks it up once the server is configured correctly.
        if exc.reason == "wrong_environment":
            logger.error(
                "Apple environment misconfigured — cannot verify %s: %s",
                user_id,
                exc.detail,
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "verification_unavailable",
                    "message": "Couldn't confirm your purchase just now. It will activate shortly.",
                },
            ) from exc

        logger.warning("Rejected Apple transaction for %s: %s", user_id, exc.detail)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": exc.reason, "message": "This purchase could not be verified."},
        ) from exc

    try:
        owner_id = await store.resolve_owner(payload, user_id, db)
    except OwnershipConflict as exc:
        # 409, and the client must treat it as terminal: finish the transaction
        # anyway, or StoreKit replays it forever and wedges the app.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_linked", "message": str(exc)},
        ) from exc

    try:
        row = store.payload_to_row(payload, owner_id)
    except UnknownProduct as exc:
        logger.warning("Verified transaction for unknown product: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "unknown_product", "message": "Unrecognized purchase."},
        ) from exc

    written = await store.upsert_transaction(row, db)
    if not written:
        logger.info(
            "Ignored stale replay of transaction %s for %s", row["transaction_id"], owner_id
        )

    entitlement = await store.entitlement_for_user(owner_id, db)
    logger.info(
        "Verified %s (%s) for %s -> %s",
        row["transaction_id"],
        row["product_id"],
        owner_id,
        entitlement.tier,
    )
    return entitlement.to_api()

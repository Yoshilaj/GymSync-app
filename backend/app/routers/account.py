"""
Account management — the destructive delete path.

Every user-owned table references auth.users ON DELETE CASCADE, so deleting the
auth user erases all their rows. Uses the service-role admin API.

Two things the cascade does NOT cover, both handled here:

  Re-authentication. Deletion used to need nothing but a valid access token. An
  unlocked phone, or a token lifted off a device, was enough to erase somebody's
  entire training history — irreversibly, because the cascade is thorough. It now
  requires the current password, unless the session already cleared a second
  factor, which is the stronger proof and shouldn't be asked for twice.

  Storage. Profile photos live in the `avatars` bucket — object storage, not a
  table, so no foreign key reaches it. Deleting the user left their photo behind,
  publicly readable at a stable URL, indefinitely. That's a data-erasure problem,
  not untidiness.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import AsyncClient
from supabase_auth import AsyncGoTrueClient

from app.auth import get_claims
from app.database import get_db
from app.jwt_verify import TokenClaims
from app.ratelimit import enforce
from app.routers.auth import get_auth_client

router = APIRouter(tags=["account"])
logger = logging.getLogger(__name__)

AVATAR_BUCKET = "avatars"


class DeleteAccountRequest(BaseModel):
    password: str | None = None


async def _reauthenticate(
    claims: TokenClaims,
    body: DeleteAccountRequest,
    auth: AsyncGoTrueClient,
) -> None:
    """Prove the person asking is the account holder, right now."""
    # An aal2 token means a second factor was cleared during THIS session. That is
    # a stronger proof than a password, so don't demand one on top of it.
    if claims.aal == "aal2":
        return

    if not body.password:
        raise HTTPException(status_code=400, detail="Enter your password to confirm.")
    if not claims.email:
        # A social-only account with no email and no second factor has nothing left
        # to prove with. Refusing beats deleting on a bare token.
        raise HTTPException(
            status_code=400,
            detail="Turn on two-factor authentication first, then delete your account.",
        )
    try:
        await auth.sign_in_with_password({"email": claims.email, "password": body.password})
    except Exception:
        raise HTTPException(status_code=401, detail="That password is incorrect.")


async def _purge_avatars(db: AsyncClient, user_id: str) -> None:
    """Delete everything under `avatars/{user_id}/`.

    Best effort by design: a storage hiccup must not abort the deletion. A
    half-deleted account is worse than a leftover file — the user would be told
    their account is gone while it isn't. Logged loudly enough to sweep later.
    """
    try:
        bucket = db.storage.from_(AVATAR_BUCKET)
        entries = await bucket.list(user_id)
        paths = [f"{user_id}/{e['name']}" for e in (entries or []) if e.get("name")]
        if paths:
            await bucket.remove(paths)
            logger.info("Removed %d avatar object(s) for %s", len(paths), user_id)
    except Exception:
        logger.exception("Avatar cleanup failed for %s — orphaned objects remain", user_id)


@router.delete("/account", status_code=204)
async def delete_account(
    body: DeleteAccountRequest,
    claims: TokenClaims = Depends(get_claims),
    db: AsyncClient = Depends(get_db),
    auth: AsyncGoTrueClient = Depends(get_auth_client),
) -> None:
    # Checking a password makes this a guessing oracle, same as login.
    enforce("password_change", claims.sub)

    await _reauthenticate(claims, body, auth)

    # Storage first: once the auth user is gone, so is every row that could tell
    # us which folder was theirs.
    await _purge_avatars(db, claims.sub)

    try:
        await db.auth.admin.delete_user(claims.sub)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Account deletion failed")
        raise HTTPException(status_code=500, detail="Could not delete account") from exc

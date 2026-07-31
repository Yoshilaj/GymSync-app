"""
The authenticated-request boundary.

Every protected route depends on something in this file. Two dependencies, and the
difference between them is the whole design:

  get_current_user_id — local signature check, no network. Use for ~everything.
  require_live_user   — asks Supabase whether the user still exists. Use only for
                        destructive actions.

Why the split: a JWT proves who minted it, not that the account still exists or that
the session hasn't been signed out. Confirming that costs a round-trip to GoTrue, and
paying it on every profile render (as this file used to) put Supabase in the hot path
of the entire app. Paying it once, on account deletion, is free by comparison.

See app/jwt_verify.py for the verification itself and for the revocation trade-off
this split is answering.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import AsyncClient

from app.database import get_db
from app.jwt_verify import TokenClaims, TokenInvalid, VerifierUnavailable, verify_access_token

# bearer: reads the `Authorization: Bearer <token>` header and rejects when absent.
_bearer = HTTPBearer()


async def get_claims(
    # Depends = FastAPI resolves this argument for us before the handler runs.
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> TokenClaims:
    """The base dependency: verify the bearer token, hand back its claims.

    Note the two distinct failures. An invalid token is the caller's problem (401).
    A verifier we can't reach is *ours* (503) — returning 401 there would tell every
    client to sign its user out because our own key fetch hiccuped. The old code
    collapsed both into 401.
    """
    try:
        # credentials.credentials = the raw token string from the header.
        return await verify_access_token(credentials.credentials)
    except TokenInvalid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except VerifierUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is temporarily unavailable. Please try again.",
        )


async def get_current_user_id(claims: TokenClaims = Depends(get_claims)) -> str:
    """The workhorse. Kept returning a plain `str` so the ~34 existing call sites
    across the routers didn't have to change when verification moved local."""
    return claims.sub


async def require_live_user(
    claims: TokenClaims = Depends(get_claims),
    db: AsyncClient = Depends(get_db),
) -> str:
    """get_current_user_id, plus a live check that the account still exists.

    ONLY for destructive or irreversible actions (account deletion, billing writes).
    This is the deliberate exception to local verification: it closes the window in
    which a deleted user's still-unexpired token would otherwise be honoured.
    """
    try:
        response = await db.auth.admin.get_user_by_id(claims.sub)
    except Exception:
        # Can't confirm — refuse rather than guess. A destructive action is not the
        # place to fail open.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not verify your account right now. Please try again.",
        )
    if not getattr(response, "user", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return claims.sub

"""
Does this user require a second factor?

The access token says whether one *was* used (`aal`). It cannot say whether one is
*required* — that lives in auth.mfa_factors, which PostgREST can't reach. So
profiles.mfa_enabled mirrors it (migration 015) and this module is the read path.

The mirror is cached in-process because the alternative is a database round-trip on
every authenticated request, which is exactly the cost Phase 1 removed by verifying
tokens locally. A short TTL plus explicit invalidation on enroll/unenroll keeps the
window small.

DIRECTION OF FAILURE. A stale cache can be wrong two ways, and they are not equally
bad:
  - stale TRUE  → a user who just unenrolled is asked for a code they can't produce.
                  Annoying, self-correcting, and they can sign out and back in.
  - stale FALSE → a user with 2FA on is let in without it. That is the whole feature
                  failing silently.
So enabling is written through immediately, and a lookup that errors is treated as
"required" rather than "not required" when we have any reason to think it's on.
"""

import logging

from supabase import AsyncClient

from app.cache import InMemoryTTLCache, make_key

logger = logging.getLogger(__name__)

# Short enough that an unenroll self-heals quickly, long enough that a burst of
# requests from one screen costs a single query.
_TTL_S = 60

_cache = InMemoryTTLCache(default_ttl_s=_TTL_S)

# Postgres "undefined_column". Surfaced by PostgREST as an APIError carrying it.
_UNDEFINED_COLUMN = "42703"
_warned_missing = False


def _key(user_id: str) -> str:
    return make_key("mfa_enabled", user_id)


def _is_missing_column(exc: Exception) -> bool:
    """True when the failure is specifically 'profiles.mfa_enabled does not exist'.

    Narrow on purpose. Treating any error as a missing column would silently
    disable the 2FA gate on an unrelated database problem.
    """
    code = getattr(exc, "code", None)
    message = str(getattr(exc, "message", "") or exc)
    return code == _UNDEFINED_COLUMN and "mfa_enabled" in message


def _warn_missing_column() -> None:
    global _warned_missing
    _warned_missing = True
    logger.warning(
        "profiles.mfa_enabled is missing — migration 015 has not been applied. "
        "Two-factor enforcement is INERT until it is. Enrollment will also fail to "
        "record state, so no account can be locked out by this; apply "
        "backend/supabase/migrations/015_mfa_flag.sql to switch the gate on."
    )


async def is_mfa_required(db: AsyncClient, user_id: str) -> bool:
    """True when this account has a verified second factor."""
    cached = await _cache.get(_key(user_id))
    if cached is not None:
        return bool(cached)

    try:
        res = await db.table("profiles").select("mfa_enabled").eq("user_id", user_id).execute()
    except Exception as exc:
        if _is_missing_column(exc):
            # Migration 015 hasn't run. Answering False is safe HERE specifically,
            # and only here: without the column, enrollment can't have recorded
            # anything, so nobody has 2FA to bypass. The alternative — raising —
            # would 503 every authenticated request in the app the moment this
            # code deploys ahead of the migration.
            if not _warned_missing:
                _warn_missing_column()
            return False
        # Any other failure: don't cache it, and don't invent a permissive answer.
        # Returning False would be the stale-FALSE case above.
        logger.exception("MFA state lookup failed for %s", user_id)
        raise

    enabled = bool(res.data[0].get("mfa_enabled")) if res.data else False
    await _cache.set(_key(user_id), enabled)
    return enabled


async def sync_from_factors(db: AsyncClient, user_id: str) -> bool:
    """Re-read the real factor list and write the mirror. Returns the new value.

    Called after the client enrolls or unenrolls. Deliberately does NOT accept the
    answer from the request body: a client that could assert "I have no factors"
    could switch its own 2FA off.
    """
    try:
        res = await db.auth.admin.mfa.list_factors({"user_id": user_id})
        factors = getattr(res, "factors", None) or []
        enabled = any(getattr(f, "status", None) == "verified" for f in factors)
    except Exception:
        logger.exception("Could not list MFA factors for %s", user_id)
        raise

    try:
        await db.table("profiles").update({"mfa_enabled": enabled}).eq("user_id", user_id).execute()
    except Exception as exc:
        if _is_missing_column(exc):
            # Loud, and it fails: enrolling while the gate can't be recorded would
            # give the user a false sense that 2FA is protecting their account.
            _warn_missing_column()
            raise RuntimeError(
                "Cannot record MFA state — migration 015 has not been applied."
            ) from exc
        raise

    await _cache.set(_key(user_id), enabled)
    return enabled


def invalidate(user_id: str) -> None:
    """Force the next read to hit the database."""
    _cache._store.pop(_key(user_id), None)  # noqa: SLF001 — same package's cache

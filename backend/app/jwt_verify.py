"""
Local verification of Supabase access tokens.

WHY LOCAL. The previous implementation called `db.auth.get_user(token)` on every
authenticated request — a full HTTPS round-trip to GoTrue per API call. That put
Supabase in the hot path of every screen, spent GoTrue's rate limit on traffic that
proves nothing new, and meant a momentary Supabase blip read as "everyone's token is
invalid". A JWT already carries its own proof; checking the signature locally is the
whole point of the format.

KEY REGIME. This project signs with **ES256 asymmetric keys** and publishes them at
`/auth/v1/.well-known/jwks.json`, so JWKS is the primary path. The legacy symmetric
`SUPABASE_JWT_SECRET` is kept only as a rollback path: if the project is ever moved
back to shared-secret HS256, verification keeps working without a code change. That
secret is optional now — see app/config.py.

THE TRADE-OFF, STATED PLAINLY. Local verification cannot see revocation. Signing out
revokes the *refresh* token; the access token the client already holds stays
cryptographically valid until its `exp`. So a signed-out or deleted user retains API
access for up to one token lifetime. Two mitigations, both deliberate:

  1. The project's access-token TTL is lowered (Supabase → Auth → Sessions), which
     bounds that window.
  2. Genuinely destructive routes do NOT rely on this module alone — they take the
     live round-trip via `require_live_user` in app/auth.py. Paying ~200ms to delete
     an account is fine; paying it to render a profile is not.

FAILURE MODES ARE DISTINGUISHED. A bad signature and an unreachable JWKS endpoint are
different events and must not collapse into the same 401: the first is a forged or
stale token, the second is our own outage. `TokenInvalid` → 401, `VerifierUnavailable`
→ 503. The old bare `except Exception: raise 401` conflated them, which is how a
network blip turns into a mass sign-out.
"""

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JOSEError, JWTClaimsError

from app.config import settings

logger = logging.getLogger(__name__)

# Supabase stamps every user token with this audience and issuer. Both are checked;
# `aud` alone would accept a token minted by a *different* Supabase project.
_AUDIENCE = "authenticated"
_ISSUER = f"{settings.supabase_url.rstrip('/')}/auth/v1"
_JWKS_URL = f"{_ISSUER}/.well-known/jwks.json"

# Algorithms we accept, split by where the key comes from. Anything outside these two
# sets is rejected outright — notably "none", and notably HS256 signed with a *public*
# key, which is the classic algorithm-confusion attack.
_ASYMMETRIC_ALGS = frozenset({"ES256", "RS256", "ES384", "RS384", "ES512", "RS512"})
_SYMMETRIC_ALGS = frozenset({"HS256", "HS384", "HS512"})

_JWKS_TTL_S = 600
# A token can name any `kid` it likes, so an unknown one must not become a free
# request to Supabase. After a miss we refetch at most once per cooldown.
_REFETCH_COOLDOWN_S = 30
_FETCH_TIMEOUT_S = 5.0


class TokenInvalid(Exception):
    """The token is malformed, expired, or not signed by this project. → 401."""


class VerifierUnavailable(Exception):
    """We could not obtain a key to check against. Our fault, not theirs. → 503."""


@dataclass(frozen=True)
class TokenClaims:
    """The subset of the Supabase JWT the app actually uses."""

    sub: str
    email: str | None
    # "aal1" = password/social only; "aal2" = a second factor was verified this session.
    aal: str
    # Authentication methods, flattened from GoTrue's [{"method": ..., "timestamp": ...}].
    amr: tuple[str, ...]
    session_id: str | None
    expires_at: int
    #: When this token was minted. Used to prove a *recent* sign-in on accounts
    #: that have no password to re-check — see routers/account.py.
    issued_at: int

    @property
    def has_mfa(self) -> bool:
        return self.aal == "aal2"


_keys: dict[str, dict] = {}
_keys_fetched_at: float = 0.0
_last_fetch_attempt: float = 0.0
_fetch_lock = asyncio.Lock()


async def _fetch_jwks() -> dict[str, dict]:
    """Pull the key set and index it by `kid`. Raises on transport failure."""
    async with httpx.AsyncClient(timeout=_FETCH_TIMEOUT_S) as client:
        res = await client.get(_JWKS_URL)
        res.raise_for_status()
        payload = res.json()
    keys = {k["kid"]: k for k in payload.get("keys", []) if k.get("kid")}
    if not keys:
        raise ValueError("JWKS response contained no usable keys")
    return keys


async def _load_jwks(force: bool = False) -> dict[str, dict]:
    """Cached key set. On a fetch failure we keep serving the cached keys if we have
    any — a stale-but-valid key set verifies tokens correctly, and signing keys rotate
    on the order of months. Only a cold cache is a real outage."""
    global _keys, _keys_fetched_at, _last_fetch_attempt

    now = time.monotonic()
    fresh = _keys and (now - _keys_fetched_at) < _JWKS_TTL_S
    if fresh and not force:
        return _keys

    async with _fetch_lock:
        # Re-check inside the lock: a concurrent caller may have just refreshed.
        now = time.monotonic()
        if _keys and (now - _keys_fetched_at) < _JWKS_TTL_S and not force:
            return _keys
        if force and (now - _last_fetch_attempt) < _REFETCH_COOLDOWN_S:
            return _keys  # cooldown — don't let unknown kids drive traffic to Supabase
        _last_fetch_attempt = now
        try:
            _keys = await _fetch_jwks()
            _keys_fetched_at = time.monotonic()
        except Exception as exc:
            if _keys:
                logger.warning("JWKS refresh failed, serving cached keys: %s", exc)
                return _keys
            logger.error("JWKS fetch failed with no cached keys: %s", exc)
            raise VerifierUnavailable("Could not fetch signing keys") from exc
    return _keys


async def _key_for_kid(kid: str | None) -> dict:
    if not kid:
        raise TokenInvalid("Token header has no key id")
    keys = await _load_jwks()
    if kid not in keys:
        # Could be a legitimate rotation we haven't seen yet — one forced refetch.
        keys = await _load_jwks(force=True)
    if kid not in keys:
        raise TokenInvalid("Token signed by an unknown key")
    return keys[kid]


def _flatten_amr(raw: object) -> tuple[str, ...]:
    """GoTrue emits [{"method": "password", "timestamp": ...}]; older/other issuers
    emit a plain list of strings. Accept both, keep only the method names."""
    if not isinstance(raw, list):
        return ()
    methods: list[str] = []
    for item in raw:
        if isinstance(item, dict):
            method = item.get("method")
            if isinstance(method, str):
                methods.append(method)
        elif isinstance(item, str):
            methods.append(item)
    return tuple(methods)


async def verify_access_token(token: str) -> TokenClaims:
    """Verify signature, issuer, audience and expiry. Returns the claims we use.

    Raises TokenInvalid (the caller's problem, 401) or VerifierUnavailable (ours, 503).
    """
    try:
        header = jwt.get_unverified_header(token)
    except JOSEError as exc:
        raise TokenInvalid("Malformed token") from exc

    alg = header.get("alg")
    if alg in _ASYMMETRIC_ALGS:
        key: object = await _key_for_kid(header.get("kid"))
    elif alg in _SYMMETRIC_ALGS:
        # Rollback path only. Without a configured secret we must fail closed rather
        # than fall through to the public key — that is algorithm confusion.
        if not settings.supabase_jwt_secret:
            raise TokenInvalid("Symmetric token received but no shared secret is configured")
        key = settings.supabase_jwt_secret
    else:
        raise TokenInvalid(f"Unsupported signing algorithm: {alg!r}")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience=_AUDIENCE,
            issuer=_ISSUER,
            options={"require_exp": True, "verify_aud": True, "verify_iss": True},
        )
    except ExpiredSignatureError as exc:
        raise TokenInvalid("Token expired") from exc
    except JWTClaimsError as exc:
        raise TokenInvalid(f"Token claims rejected: {exc}") from exc
    except JOSEError as exc:
        raise TokenInvalid("Token signature verification failed") from exc

    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        raise TokenInvalid("Token has no subject")

    return TokenClaims(
        sub=sub,
        email=claims.get("email") or None,
        aal=claims.get("aal") or "aal1",
        amr=_flatten_amr(claims.get("amr")),
        session_id=claims.get("session_id") or None,
        expires_at=int(claims.get("exp", 0)),
        issued_at=int(claims.get("iat", 0)),
    )


async def warm_jwks() -> None:
    """Pull the key set at startup so the first authenticated request isn't the one
    paying for it. A failure here is logged, not fatal — the app can still serve
    unauthenticated routes, and the next request retries."""
    try:
        await _load_jwks()
        logger.info("JWKS warmed (%d key(s))", len(_keys))
    except Exception as exc:  # noqa: BLE001 — startup must not hard-fail on this
        logger.warning("JWKS warm-up failed; will retry on first request: %s", exc)


def _reset_for_tests() -> None:
    """Drop cached keys. Tests only."""
    global _keys, _keys_fetched_at, _last_fetch_attempt
    _keys = {}
    _keys_fetched_at = 0.0
    _last_fetch_attempt = 0.0

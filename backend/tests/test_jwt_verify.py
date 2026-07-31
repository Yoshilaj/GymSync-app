"""
Token verification — the boundary every authenticated request crosses.

Signed with a locally generated ES256 key rather than the project's, so these
run offline and can't be weakened by a change in the Supabase dashboard.

The forgeries below are the ones that actually get tried: alg=none, HS256 signed
with the public key (algorithm confusion), a token from a different project, and
one whose signature was nudged by a byte.
"""
import json
import time

import pytest
from jose import jwt
from jose.utils import base64url_encode

from app import jwt_verify
from app.jwt_verify import TokenInvalid, VerifierUnavailable, verify_access_token

ISSUER = jwt_verify._ISSUER
KID = "test-key-1"


@pytest.fixture(scope="module")
def keypair():
    """An EC P-256 key in JWK form, matching what Supabase publishes."""
    from cryptography.hazmat.primitives.asymmetric import ec

    private = ec.generate_private_key(ec.SECP256R1())
    numbers = private.public_key().public_numbers()

    def b64(n: int) -> str:
        return base64url_encode(n.to_bytes(32, "big")).decode().rstrip("=")

    jwk = {
        "kty": "EC", "crv": "P-256", "kid": KID, "alg": "ES256", "use": "sig",
        "x": b64(numbers.x), "y": b64(numbers.y),
    }
    from cryptography.hazmat.primitives import serialization

    pem = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    return pem, jwk


@pytest.fixture(autouse=True)
def _installed_keys(keypair, monkeypatch):
    """Seed the module's key cache so nothing reaches the network."""
    _, jwk = keypair
    jwt_verify._reset_for_tests()
    monkeypatch.setattr(jwt_verify, "_keys", {KID: jwk})
    monkeypatch.setattr(jwt_verify, "_keys_fetched_at", time.monotonic())
    yield
    jwt_verify._reset_for_tests()


def make_token(keypair, **overrides) -> str:
    pem, _ = keypair
    claims = {
        "sub": "11111111-2222-3333-4444-555555555555",
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
        "email": "lifter@example.com",
        "aal": "aal1",
        "amr": [{"method": "password", "timestamp": int(time.time())}],
        "session_id": "abc",
    }
    claims.update(overrides)
    return jwt.encode(claims, pem, algorithm="ES256", headers={"kid": KID})


async def test_accepts_a_well_formed_token(keypair):
    claims = await verify_access_token(make_token(keypair))
    assert claims.sub == "11111111-2222-3333-4444-555555555555"
    assert claims.email == "lifter@example.com"
    assert claims.aal == "aal1"
    # GoTrue sends amr as a list of dicts; we flatten to method names.
    assert claims.amr == ("password",)
    assert claims.has_mfa is False


async def test_reads_aal2_and_recovery_sessions(keypair):
    claims = await verify_access_token(
        make_token(keypair, aal="aal2", amr=[{"method": "password"}, {"method": "totp"}])
    )
    assert claims.has_mfa is True

    # A recovery link mints amr=otp — the signal /reset-password/confirm keys on.
    recovery = await verify_access_token(make_token(keypair, amr=[{"method": "otp"}]))
    assert "otp" in recovery.amr


async def test_rejects_an_expired_token(keypair):
    with pytest.raises(TokenInvalid):
        await verify_access_token(make_token(keypair, exp=int(time.time()) - 10))


async def test_rejects_a_token_from_another_project(keypair):
    """Same key would never happen, but the issuer check is what stops a token
    minted by a DIFFERENT Supabase project from being accepted here."""
    with pytest.raises(TokenInvalid):
        await verify_access_token(make_token(keypair, iss="https://someone-else.supabase.co/auth/v1"))


async def test_rejects_a_wrong_audience(keypair):
    with pytest.raises(TokenInvalid):
        await verify_access_token(make_token(keypair, aud="anon"))


async def test_rejects_a_tampered_signature(keypair):
    token = make_token(keypair)
    head, payload, sig = token.split(".")
    flipped = ("B" if sig[0] != "B" else "C") + sig[1:]
    with pytest.raises(TokenInvalid):
        await verify_access_token(f"{head}.{payload}.{flipped}")


async def test_rejects_alg_none():
    """The oldest JWT forgery there is: strip the signature and claim it wasn't
    needed."""
    header = base64url_encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64url_encode(
        json.dumps({"sub": "attacker", "aud": "authenticated", "iss": ISSUER,
                    "exp": int(time.time()) + 3600}).encode()
    ).decode().rstrip("=")
    with pytest.raises(TokenInvalid):
        await verify_access_token(f"{header}.{payload}.")


async def test_rejects_algorithm_confusion(keypair, monkeypatch):
    """HS256 signed with the PUBLIC key. If the verifier picks the algorithm from
    the token's own header and hands it whatever key it has, the public key
    becomes a valid HMAC secret and anyone can mint tokens.

    Here it must fail closed because no shared secret is configured.
    """
    monkeypatch.setattr(jwt_verify.settings, "supabase_jwt_secret", "")
    _, jwk = keypair
    forged = jwt.encode(
        {"sub": "attacker", "aud": "authenticated", "iss": ISSUER, "exp": int(time.time()) + 3600},
        jwk["x"],  # the public key material, used as an HMAC secret
        algorithm="HS256",
        headers={"kid": KID},
    )
    with pytest.raises(TokenInvalid):
        await verify_access_token(forged)


async def test_rejects_garbage():
    for junk in ("", "not-a-jwt", "a.b.c", "..."):
        with pytest.raises(TokenInvalid):
            await verify_access_token(junk)


async def test_unknown_kid_is_the_callers_problem_not_an_outage(monkeypatch):
    """An unknown key id must be a 401, not a 503 — otherwise anyone can make the
    server report itself unhealthy by sending a made-up kid."""
    async def no_refresh(force=False):
        return jwt_verify._keys

    monkeypatch.setattr(jwt_verify, "_load_jwks", no_refresh)
    header = base64url_encode(json.dumps({"alg": "ES256", "kid": "nope"}).encode()).decode().rstrip("=")
    with pytest.raises(TokenInvalid):
        await verify_access_token(f"{header}.e30.sig")


async def test_no_keys_and_no_network_is_our_problem(keypair, monkeypatch):
    """Cold cache plus an unreachable JWKS endpoint is a 503, not a 401. Getting
    this backwards signs out every user during a blip."""
    token = make_token(keypair)
    jwt_verify._reset_for_tests()
    monkeypatch.setattr(jwt_verify, "_JWKS_URL", "http://127.0.0.1:9/nope")
    with pytest.raises(VerifierUnavailable):
        await verify_access_token(token)


async def test_cached_keys_survive_a_jwks_outage(keypair, monkeypatch):
    """Signing keys rotate on the order of months, so a stale-but-valid key set
    verifying correctly beats failing every request."""
    token = make_token(keypair)
    monkeypatch.setattr(jwt_verify, "_JWKS_URL", "http://127.0.0.1:9/nope")
    monkeypatch.setattr(jwt_verify, "_keys_fetched_at", 0.0)  # force the TTL to look stale
    claims = await verify_access_token(token)
    assert claims.sub


def test_amr_flattening_handles_both_shapes():
    """GoTrue sends dicts; other issuers send plain strings."""
    assert jwt_verify._flatten_amr([{"method": "password"}]) == ("password",)
    assert jwt_verify._flatten_amr(["otp"]) == ("otp",)
    assert jwt_verify._flatten_amr(None) == ()
    assert jwt_verify._flatten_amr([{"no_method": 1}, "totp"]) == ("totp",)

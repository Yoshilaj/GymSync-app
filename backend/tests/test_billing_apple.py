"""
Transaction verification and its configuration guards (no network, no DB).

The headline test here is `test_forged_xcode_transaction_is_rejected_in_production`.
Apple's library deliberately skips signature verification for Xcode and
LocalTesting data — it is signed by a local test certificate, so there is
nothing to check. That carve-out is fine until the verifier is chosen from the
environment field *inside the transaction being verified*, at which point anyone
can hand-write an unsigned JWT claiming to be an Xcode transaction and be handed
Premium for life.

These tests pin the boundary shut: the environment comes from OUR config, and a
forged payload cannot reach the unsigned path unless we deliberately opened it.
"""
import base64
import json

import pytest

from app.billing.apple import (
    BillingConfigError,
    TransactionRejected,
    configured_environments,
    reset_verifiers,
    validate_billing_settings,
    verify_transaction,
)
from app.config import settings


@pytest.fixture(autouse=True)
def restore_settings():
    """
    Every test mutates global settings; put them back.

    Verifiers are cached on the settings they were built from, so the cache is
    cleared on both sides — otherwise a case could pass against a verifier
    another case configured, which is the kind of green that means nothing.
    """
    saved = (
        settings.apple_environments,
        settings.apple_allow_local_testing,
        settings.app_env,
        settings.apple_app_id,
        settings.apple_bundle_id,
    )
    reset_verifiers()
    yield
    (
        settings.apple_environments,
        settings.apple_allow_local_testing,
        settings.app_env,
        settings.apple_app_id,
        settings.apple_bundle_id,
    ) = saved
    reset_verifiers()


def _b64(data: dict) -> str:
    raw = json.dumps(data).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def forged_jws(**claims) -> str:
    """
    An unsigned JWT shaped like an Apple transaction.

    This is exactly what an attacker would POST: valid structure, entirely
    fabricated contents, and a signature section that is noise.
    """
    payload = {
        "environment": "Xcode",
        "bundleId": settings.apple_bundle_id,
        "productId": "com.yoshinishikawahara.gymsync.premium.yearly",
        "transactionId": "forged-1",
        "originalTransactionId": "forged-1",
        "purchaseDate": 1_700_000_000_000,
        "expiresDate": 99_999_999_999_000,
        "type": "Auto-Renewable Subscription",
        "inAppOwnershipType": "PURCHASED",
    }
    payload.update(claims)
    return f"{_b64({'alg': 'ES256', 'x5c': []})}.{_b64(payload)}.bm90YXNpZ25hdHVyZQ"


# ── The bypass, closed ───────────────────────────────────────────────────────


@pytest.mark.parametrize("envs", ["Production,Sandbox", "Sandbox", "Production"])
def test_forged_xcode_transaction_is_rejected_in_production(envs):
    """
    THE regression test for the entitlement bypass.

    A forged unsigned transaction claiming environment "Xcode" must not verify
    when the server is configured for real environments — no matter what the
    payload says about itself.
    """
    settings.apple_environments = envs
    settings.apple_app_id = 123456789
    settings.apple_allow_local_testing = False

    with pytest.raises(TransactionRejected):
        verify_transaction(forged_jws())


def test_forged_transaction_is_rejected_even_claiming_production():
    """Claiming a signed environment doesn't help: there is no valid signature."""
    settings.apple_environments = "Production"
    settings.apple_app_id = 123456789
    with pytest.raises(TransactionRejected):
        verify_transaction(forged_jws(environment="Production"))


def test_unsigned_transaction_verifies_only_when_local_testing_is_opened():
    """
    The other half of the contract: with Xcode explicitly allowed, the same
    payload decodes. This is what makes simulator testing possible, and it is
    why the flag exists and why production refuses to boot with it on.
    """
    settings.apple_environments = "Xcode"
    settings.apple_allow_local_testing = True
    settings.app_env = "development"

    payload = verify_transaction(forged_jws())
    assert payload.productId == "com.yoshinishikawahara.gymsync.premium.yearly"
    assert payload.rawEnvironment == "Xcode"


def test_wrong_bundle_id_is_rejected_in_local_testing():
    """Bundle ID is checked even on the unsigned path — the one guard that survives."""
    settings.apple_environments = "Xcode"
    settings.apple_allow_local_testing = True

    with pytest.raises(TransactionRejected) as exc:
        verify_transaction(forged_jws(bundleId="com.attacker.app"))
    assert exc.value.reason == "wrong_app"


def test_environment_mismatch_is_reported_as_such():
    """
    Distinct from the other rejections on purpose: the router turns this reason
    into a RETRYABLE 503, not a 422. An environment mismatch means the server is
    misconfigured, and calling that permanent makes the client finish — and so
    discard — a purchase the customer really made.
    """
    settings.apple_environments = "LocalTesting"
    settings.apple_allow_local_testing = True

    with pytest.raises(TransactionRejected) as exc:
        verify_transaction(forged_jws(environment="Xcode"))
    assert exc.value.reason == "wrong_environment"


def test_a_sandbox_transaction_is_refused_when_only_xcode_is_configured():
    """
    The exact first-sandbox-purchase failure: server still on Xcode, customer
    buying in Sandbox. Must be reported as wrong_environment (retryable), never
    as an invalid transaction.
    """
    settings.apple_environments = "Xcode"
    settings.apple_allow_local_testing = True

    with pytest.raises(TransactionRejected) as exc:
        verify_transaction(forged_jws(environment="Sandbox"))
    assert exc.value.reason == "wrong_environment"


@pytest.mark.parametrize("junk", ["", "   ", "not-a-jws", "a.b", "a.b.c.d"])
def test_malformed_input_is_rejected_cleanly(junk):
    """Garbage in must raise TransactionRejected, never leak an internal error."""
    settings.apple_environments = "Xcode"
    settings.apple_allow_local_testing = True

    with pytest.raises(TransactionRejected):
        verify_transaction(junk)


# ── Configuration guards ─────────────────────────────────────────────────────


def test_unsigned_environment_requires_the_flag():
    settings.apple_environments = "Xcode"
    settings.apple_allow_local_testing = False
    settings.app_env = "development"

    with pytest.raises(BillingConfigError, match="not signed by Apple"):
        validate_billing_settings()


def test_local_testing_flag_is_refused_in_production():
    settings.apple_environments = "Sandbox"
    settings.apple_allow_local_testing = True
    settings.app_env = "production"

    with pytest.raises(BillingConfigError, match="production"):
        validate_billing_settings()


def test_production_environment_requires_an_app_id():
    """Apple's verifier cannot even be constructed without it; fail at boot."""
    settings.apple_environments = "Production"
    settings.apple_app_id = 0
    settings.app_env = "development"
    settings.apple_allow_local_testing = False

    with pytest.raises(BillingConfigError, match="apple_app_id"):
        validate_billing_settings()


def test_sandbox_only_is_valid_in_production():
    """The TestFlight configuration must be allowed to boot."""
    settings.apple_environments = "Sandbox"
    settings.apple_allow_local_testing = False
    settings.app_env = "production"
    validate_billing_settings()


def test_unknown_environment_name_raises():
    """A typo must not silently narrow the allowlist."""
    settings.apple_environments = "Sandbx"
    with pytest.raises(BillingConfigError, match="Unknown Apple environment"):
        configured_environments()


def test_empty_environment_list_raises():
    settings.apple_environments = "  "
    with pytest.raises(BillingConfigError, match="empty"):
        configured_environments()


def test_environments_keep_their_configured_order():
    """Order is the fallthrough order; Production is tried before Sandbox."""
    settings.apple_environments = "Production,Sandbox,Production"
    assert [e.value for e in configured_environments()] == ["Production", "Sandbox"]

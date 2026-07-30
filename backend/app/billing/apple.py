"""
Apple-signed transaction verification.

═══ THE RULE THIS FILE EXISTS TO ENFORCE ═══════════════════════════════════════

The environment a transaction is verified against comes from OUR configuration,
never from the transaction.

Apple's `SignedDataVerifier` deliberately skips signature and certificate-chain
verification when its environment is Xcode or LocalTesting — that data is signed
by a local test certificate, so there is nothing to check against Apple's roots.
That carve-out is correct and necessary for simulator testing.

But the payload carries its own `environment` field. Selecting the verifier from
that field — the obvious design, and the one the original plan implied — hands an
attacker the verification path. Any authenticated user could POST an unsigned,
hand-written JWT:

    {"environment": "Xcode",
     "bundleId": "com.yoshinishikawahara.gymsync",
     "productId": "...premium.yearly",
     "expiresDate": 99999999999999}

and be granted Premium forever, on a server that never checked a signature.

So: `settings.apple_environments` is an ordered allowlist, and an environment is
reachable only if it appears there. Production and Sandbox are both
cryptographically verified, so trying them in turn is safe — that fallthrough is
what lets one deployment serve TestFlight and the App Store at once. Xcode is
reachable only behind an explicit flag that refuses to coexist with production.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

from appstoreserverlibrary.models.Environment import Environment
from appstoreserverlibrary.models.JWSTransactionDecodedPayload import (
    JWSTransactionDecodedPayload,
)
from appstoreserverlibrary.signed_data_verifier import (
    SignedDataVerifier,
    VerificationException,
    VerificationStatus,
)

from app.config import settings

log = logging.getLogger(__name__)

_CERTS_DIR = Path(__file__).parent / "certs"

# Environments whose data Apple does not sign, and where verification is
# therefore a decode rather than a proof.
UNSIGNED_ENVIRONMENTS = frozenset({Environment.XCODE, Environment.LOCAL_TESTING})


class BillingConfigError(RuntimeError):
    """Billing settings are internally inconsistent — fail at startup, not at purchase."""


class TransactionRejected(Exception):
    """
    A transaction could not be verified against any configured environment.

    `reason` is a short stable slug for the client; `detail` is for our logs.
    """

    def __init__(self, reason: str, detail: str = "") -> None:
        super().__init__(detail or reason)
        self.reason = reason
        self.detail = detail


@lru_cache(maxsize=1)
def _root_certificates() -> list[bytes]:
    """
    Apple's root CAs, in DER form.

    Not bundled with the library — they are downloaded from
    https://www.apple.com/certificateauthority/ and committed under certs/.
    An empty directory would silently turn every Production verification into a
    failure, so this raises instead.
    """
    certs = sorted(_CERTS_DIR.glob("*.cer"))
    if not certs:
        raise BillingConfigError(
            f"No Apple root certificates in {_CERTS_DIR}. Download them from "
            "https://www.apple.com/certificateauthority/ (AppleRootCA-G3.cer at minimum)."
        )
    return [c.read_bytes() for c in certs]


def configured_environments() -> list[Environment]:
    """
    The ordered allowlist, parsed and validated.

    Unknown names raise rather than being skipped: a typo in this setting must
    not silently narrow the allowlist and take purchases down in a way that
    looks like an Apple outage. (`extra="ignore"` on Settings means a mistyped
    *variable name* already reads as the default, which is why the value itself
    gets checked this strictly.)
    """
    names = [n.strip() for n in settings.apple_environments.split(",") if n.strip()]
    if not names:
        raise BillingConfigError("apple_environments is empty — no transaction could verify.")

    envs: list[Environment] = []
    for name in names:
        try:
            env = Environment(name)
        except ValueError:
            valid = ", ".join(e.value for e in Environment)
            raise BillingConfigError(
                f"Unknown Apple environment {name!r} in apple_environments. Valid: {valid}."
            ) from None
        if env not in envs:
            envs.append(env)
    return envs


def validate_billing_settings() -> None:
    """
    Refuse to start on a billing configuration that could grant free access.

    Called from the app lifespan. Every check here is a deployment mistake that
    would otherwise surface as an entitlement bug in production.
    """
    envs = configured_environments()
    unsigned = [e for e in envs if e in UNSIGNED_ENVIRONMENTS]

    if unsigned and not settings.apple_allow_local_testing:
        raise BillingConfigError(
            f"apple_environments includes {unsigned[0].value}, whose transactions are not "
            "signed by Apple. Set APPLE_ALLOW_LOCAL_TESTING=true to accept that, and never "
            "in production."
        )

    if settings.app_env == "production":
        if settings.apple_allow_local_testing:
            raise BillingConfigError(
                "APPLE_ALLOW_LOCAL_TESTING is on in production. Unsigned transactions would "
                "be accepted as real purchases."
            )
        if unsigned:
            raise BillingConfigError(
                f"apple_environments includes {unsigned[0].value} in production."
            )

    if Environment.PRODUCTION in envs and not settings.apple_app_id:
        # The library raises this itself on construction; catching it here turns
        # a first-purchase 500 into a startup failure with an actionable message.
        raise BillingConfigError(
            "apple_environments includes Production but apple_app_id is unset. Apple's "
            "verifier requires the numeric App Store ID, available once the app record exists."
        )

    if unsigned:
        log.warning(
            "Apple billing is accepting UNSIGNED transactions from %s. Local StoreKit testing "
            "only — signatures are not verified.",
            ", ".join(e.value for e in unsigned),
        )


@lru_cache(maxsize=len(Environment))
def _verifier(environment: Environment) -> SignedDataVerifier:
    """
    One verifier per environment, built on first use.

    Lazy rather than eager because a Production verifier cannot be constructed
    at all until `apple_app_id` is known — an eager registry would make the
    whole module unimportable until the App Store record exists.
    """
    return SignedDataVerifier(
        root_certificates=_root_certificates(),
        # Online OCSP checks add a network round trip to every purchase and a
        # hard dependency on Apple's OCSP responder being reachable. The chain
        # is still verified; only live revocation lookup is skipped.
        enable_online_checks=False,
        environment=environment,
        bundle_id=settings.apple_bundle_id,
        app_apple_id=settings.apple_app_id or None,
    )


def reset_verifiers() -> None:
    """
    Drop the cached verifiers.

    Settings are fixed after startup in a running server, so the cache is safe
    there. Tests are the exception: they mutate settings between cases, and a
    verifier cached with an earlier bundle id would quietly pass for the wrong
    reason. Call this whenever the settings behind a verifier change.
    """
    _verifier.cache_clear()
    _root_certificates.cache_clear()


def verify_transaction(jws: str) -> JWSTransactionDecodedPayload:
    """
    Verify a signed transaction against the configured environments, in order.

    Returns the decoded payload, or raises TransactionRejected.

    Environment mismatch is the only error worth retrying against the next
    candidate — it means "right shape, wrong environment". A bundle-ID mismatch
    or a bad signature is fatal for every environment, so it stops immediately
    rather than being retried and reported as the wrong error.
    """
    if not jws or not jws.strip():
        raise TransactionRejected("invalid_transaction", "Empty JWS.")

    environments = configured_environments()
    last_detail = ""

    for env in environments:
        try:
            payload = _verifier(env).verify_and_decode_signed_transaction(jws)
        except VerificationException as exc:
            if exc.status == VerificationStatus.INVALID_ENVIRONMENT:
                last_detail = f"not a {env.value} transaction"
                continue
            if exc.status == VerificationStatus.INVALID_APP_IDENTIFIER:
                raise TransactionRejected(
                    "wrong_app",
                    f"Transaction is not for {settings.apple_bundle_id}.",
                ) from exc
            raise TransactionRejected(
                "invalid_transaction", f"Verification failed ({exc.status.name})."
            ) from exc
        except Exception as exc:  # malformed JWS, bad base64, unparseable claims
            raise TransactionRejected(
                "invalid_transaction", f"Could not decode transaction: {exc}"
            ) from exc

        # Defence in depth. The verifier already compared the payload's
        # environment against its own, so this can only fire if that contract
        # changes — but the cost of it changing unnoticed is unsigned data being
        # trusted, so it is asserted rather than assumed.
        if payload.environment != env:
            raise TransactionRejected(
                "invalid_transaction",
                f"Verifier for {env.value} returned a {payload.environment} payload.",
            )
        return payload

    raise TransactionRejected(
        "wrong_environment",
        f"Transaction matched none of {[e.value for e in environments]} ({last_detail}).",
    )

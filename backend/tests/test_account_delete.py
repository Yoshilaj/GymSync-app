"""
Account deletion — the one irreversible thing a user can do.

The cascade is thorough, so a mistake here is unrecoverable: there is no undo and
no backup of one user's rows. These cover who is allowed to trigger it and what
gets cleaned up beyond the foreign keys.
"""
import time

import pytest
from fastapi import HTTPException

from app.jwt_verify import TokenClaims
from app.routers import account
from app.routers.account import DeleteAccountRequest, _purge_avatars, _reauthenticate

USER = "11111111-2222-3333-4444-555555555555"


def claims(
    *,
    aal: str = "aal1",
    email: str | None = "lifter@example.com",
    issued_at: int | None = None,
) -> TokenClaims:
    """`issued_at` defaults to now — a token minted this instant."""
    return TokenClaims(sub=USER, email=email, aal=aal, amr=("password",),
                       session_id="s", expires_at=9_999_999_999,
                       issued_at=int(time.time()) if issued_at is None else issued_at)


class FakeIdentityDB:
    """Stands in for the admin API's identity lookup.

    `has_password=False` is an Apple/Google account: no email identity, so there
    is no password anywhere to check against.
    """

    def __init__(self, has_password: bool, fail: bool = False) -> None:
        self._has_password = has_password
        self._fail = fail

    class _Auth:
        def __init__(self, outer):
            self.admin = outer

    @property
    def auth(self):
        return FakeIdentityDB._Auth(self)

    async def get_user_by_id(self, _uid):
        if self._fail:
            raise Exception("admin API unavailable")
        provider = "email" if self._has_password else "apple"
        identity = type("I", (), {"provider": provider})()
        return type("R", (), {"user": type("U", (), {"identities": [identity]})()})()


class FakeAuth:
    """Stands in for the GoTrue client. Accepts exactly one password."""

    def __init__(self, good_password: str = "correct-horse") -> None:
        self.good = good_password
        self.attempts: list[str] = []

    async def sign_in_with_password(self, creds: dict):
        self.attempts.append(creds["password"])
        if creds["password"] != self.good:
            raise Exception("invalid_credentials")
        return object()


async def test_correct_password_is_accepted():
    auth = FakeAuth()
    await _reauthenticate(claims(), DeleteAccountRequest(password="correct-horse"), auth, FakeIdentityDB(has_password=True))
    assert auth.attempts == ["correct-horse"]


async def test_wrong_password_is_refused():
    auth = FakeAuth()
    with pytest.raises(HTTPException) as exc:
        await _reauthenticate(claims(), DeleteAccountRequest(password="guess"), auth, FakeIdentityDB(has_password=True))
    assert exc.value.status_code == 401


async def test_a_bare_token_is_not_enough():
    """The whole point. Deletion used to need only a valid access token, so an
    unlocked phone could erase somebody's entire training history."""
    auth = FakeAuth()
    with pytest.raises(HTTPException) as exc:
        await _reauthenticate(claims(), DeleteAccountRequest(), auth, FakeIdentityDB(has_password=True))
    assert exc.value.status_code == 400
    assert auth.attempts == []  # never even asked


async def test_empty_password_is_not_a_password():
    auth = FakeAuth()
    with pytest.raises(HTTPException):
        await _reauthenticate(claims(), DeleteAccountRequest(password=""), auth, FakeIdentityDB(has_password=True))
    assert auth.attempts == []


async def test_a_cleared_second_factor_stands_in_for_the_password():
    """aal2 means a factor was verified during THIS session — stronger proof than
    a password, so asking for one on top of it is friction with no benefit."""
    auth = FakeAuth()
    await _reauthenticate(claims(aal="aal2"), DeleteAccountRequest(), auth, FakeIdentityDB(has_password=True))
    assert auth.attempts == []


# ── accounts with no password (Apple / Google) ──────────────────────────────
#
# These used to be undeletable: reauth demanded a password the account never had,
# so sign_in_with_password could only fail. In-app deletion is mandatory under
# App Review 5.1.1(v), so that was a shipping blocker, not an inconvenience.


async def test_social_account_deletes_after_a_fresh_sign_in():
    """The client re-runs Apple/Google immediately before deleting, which mints a
    new token. Recency IS the proof when there's no password to check."""
    auth = FakeAuth()
    await _reauthenticate(claims(), DeleteAccountRequest(), auth, FakeIdentityDB(has_password=False))
    assert auth.attempts == []  # never asked for a password it doesn't have


async def test_social_account_with_a_stale_token_is_refused():
    """The unlocked-phone case. A valid but old token is not a fresh sign-in."""
    auth = FakeAuth()
    stale = int(time.time()) - account.FRESH_SIGN_IN_S - 60
    with pytest.raises(HTTPException) as exc:
        await _reauthenticate(claims(issued_at=stale), DeleteAccountRequest(), auth,
                              FakeIdentityDB(has_password=False))
    assert exc.value.status_code == 401
    # Tells the client to re-run the provider sheet rather than show a password box.
    assert exc.value.headers.get("X-Reauth-Required") == "provider"


async def test_a_token_with_no_iat_is_refused():
    """Absent recency evidence is not evidence of recency."""
    auth = FakeAuth()
    with pytest.raises(HTTPException):
        await _reauthenticate(claims(issued_at=0), DeleteAccountRequest(), auth,
                              FakeIdentityDB(has_password=False))


async def test_social_account_with_2fa_skips_all_of_it():
    auth = FakeAuth()
    await _reauthenticate(claims(aal="aal2", issued_at=0), DeleteAccountRequest(), auth,
                          FakeIdentityDB(has_password=False))


async def test_identity_lookup_failure_asks_for_more_proof_not_less():
    """If we can't tell whether a password exists, demand one. Wrong in the safe
    direction: the worst case is a social user seeing a password box, not a
    stranger deleting an account."""
    auth = FakeAuth()
    with pytest.raises(HTTPException) as exc:
        await _reauthenticate(claims(), DeleteAccountRequest(), auth,
                              FakeIdentityDB(has_password=False, fail=True))
    assert exc.value.status_code == 400


class FakeBucket:
    def __init__(self, entries, fail: bool = False):
        self._entries = entries
        self._fail = fail
        self.removed: list[str] = []

    async def list(self, prefix: str):
        if self._fail:
            raise Exception("storage is down")
        return self._entries

    async def remove(self, paths):
        self.removed.extend(paths)


class FakeStorageDB:
    def __init__(self, bucket):
        self._bucket = bucket
        self.storage = self

    def from_(self, _name):
        return self._bucket


async def test_avatars_are_deleted_with_the_account():
    """Storage has no foreign key, so the cascade misses it. A photo left behind
    stays publicly readable at a stable URL — an erasure problem, not untidiness."""
    bucket = FakeBucket([{"name": "profile.jpg"}, {"name": "old.png"}])
    await _purge_avatars(FakeStorageDB(bucket), USER)
    assert bucket.removed == [f"{USER}/profile.jpg", f"{USER}/old.png"]


async def test_no_avatar_means_nothing_to_remove():
    bucket = FakeBucket([])
    await _purge_avatars(FakeStorageDB(bucket), USER)
    assert bucket.removed == []


async def test_storage_failure_does_not_abort_the_deletion():
    """A half-deleted account is worse than a leftover file: the user is told
    their account is gone while it isn't."""
    bucket = FakeBucket([], fail=True)
    await _purge_avatars(FakeStorageDB(bucket), USER)  # must not raise


async def test_malformed_storage_entries_are_skipped():
    bucket = FakeBucket([{"name": "good.jpg"}, {}, {"name": None}])
    await _purge_avatars(FakeStorageDB(bucket), USER)
    assert bucket.removed == [f"{USER}/good.jpg"]

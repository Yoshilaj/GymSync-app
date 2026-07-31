"""
Account deletion — the one irreversible thing a user can do.

The cascade is thorough, so a mistake here is unrecoverable: there is no undo and
no backup of one user's rows. These cover who is allowed to trigger it and what
gets cleaned up beyond the foreign keys.
"""
import pytest
from fastapi import HTTPException

from app.jwt_verify import TokenClaims
from app.routers import account
from app.routers.account import DeleteAccountRequest, _purge_avatars, _reauthenticate

USER = "11111111-2222-3333-4444-555555555555"


def claims(*, aal: str = "aal1", email: str | None = "lifter@example.com") -> TokenClaims:
    return TokenClaims(sub=USER, email=email, aal=aal, amr=("password",),
                       session_id="s", expires_at=9_999_999_999)


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
    await _reauthenticate(claims(), DeleteAccountRequest(password="correct-horse"), auth)
    assert auth.attempts == ["correct-horse"]


async def test_wrong_password_is_refused():
    auth = FakeAuth()
    with pytest.raises(HTTPException) as exc:
        await _reauthenticate(claims(), DeleteAccountRequest(password="guess"), auth)
    assert exc.value.status_code == 401


async def test_a_bare_token_is_not_enough():
    """The whole point. Deletion used to need only a valid access token, so an
    unlocked phone could erase somebody's entire training history."""
    auth = FakeAuth()
    with pytest.raises(HTTPException) as exc:
        await _reauthenticate(claims(), DeleteAccountRequest(), auth)
    assert exc.value.status_code == 400
    assert auth.attempts == []  # never even asked


async def test_empty_password_is_not_a_password():
    auth = FakeAuth()
    with pytest.raises(HTTPException):
        await _reauthenticate(claims(), DeleteAccountRequest(password=""), auth)
    assert auth.attempts == []


async def test_a_cleared_second_factor_stands_in_for_the_password():
    """aal2 means a factor was verified during THIS session — stronger proof than
    a password, so asking for one on top of it is friction with no benefit."""
    auth = FakeAuth()
    await _reauthenticate(claims(aal="aal2"), DeleteAccountRequest(), auth)
    assert auth.attempts == []


async def test_social_account_with_no_email_and_no_factor_is_refused():
    """Nothing left to prove with. Refusing beats deleting on a bare token."""
    auth = FakeAuth()
    with pytest.raises(HTTPException) as exc:
        await _reauthenticate(claims(email=None), DeleteAccountRequest(password="x"), auth)
    assert exc.value.status_code == 400
    assert "two-factor" in exc.value.detail.lower()


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

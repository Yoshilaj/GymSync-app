"""
The aal2 gate — whether a session that hasn't cleared its second factor gets in.

Two failure directions, and they are not symmetric:
  stale/incorrect TRUE  → a user is asked for a code they can't produce. Annoying.
  stale/incorrect FALSE → 2FA is silently off. The whole feature, failing quietly.
Most of these exist to pin down the second one.
"""
import pytest
from fastapi import HTTPException

from app import auth as auth_mod
from app import mfa_state
from app.jwt_verify import TokenClaims

USER = "11111111-2222-3333-4444-555555555555"


@pytest.fixture(autouse=True)
def _clean():
    mfa_state._cache._store.clear()
    mfa_state._warned_missing = False
    yield
    mfa_state._cache._store.clear()


class MissingColumn(Exception):
    code = "42703"
    message = "column profiles.mfa_enabled does not exist"


class OtherDbError(Exception):
    code = "08006"
    message = "connection to server failed"


class DifferentMissingColumn(Exception):
    code = "42703"
    message = "column profiles.some_other_thing does not exist"


class FakeDB:
    """Answers the one select mfa_state makes."""

    def __init__(self, rows=None, error: Exception | None = None):
        self._rows = rows if rows is not None else [{"mfa_enabled": False}]
        self._error = error
        self.queries = 0

    def table(self, _name):
        return self

    def select(self, *_c):
        return self

    def eq(self, *_a):
        return self

    async def execute(self):
        self.queries += 1
        if self._error:
            raise self._error
        return type("R", (), {"data": self._rows})()


# ── the missing-column degradation ──────────────────────────────────────────

def test_missing_column_is_recognised_narrowly():
    """Treating ANY error as "column missing" would disable the gate on an
    unrelated database problem."""
    assert mfa_state._is_missing_column(MissingColumn())
    assert not mfa_state._is_missing_column(OtherDbError())
    assert not mfa_state._is_missing_column(DifferentMissingColumn())


async def test_missing_column_reads_as_off_rather_than_erroring():
    """This code can deploy ahead of migration 015. Raising would 503 every
    authenticated request in the app; answering False is safe here specifically,
    because without the column nothing can have enrolled."""
    db = FakeDB(error=MissingColumn())
    assert await mfa_state.is_mfa_required(db, USER) is False


async def test_an_unrelated_db_error_is_not_swallowed():
    """The dangerous direction. A connection failure must not read as 2FA-off."""
    db = FakeDB(error=OtherDbError())
    with pytest.raises(OtherDbError):
        await mfa_state.is_mfa_required(db, USER)


async def test_a_failed_lookup_is_not_cached():
    """Caching a failure would extend one blip into a minute of missing gate."""
    db = FakeDB(error=OtherDbError())
    with pytest.raises(OtherDbError):
        await mfa_state.is_mfa_required(db, USER)

    db._error = None
    db._rows = [{"mfa_enabled": True}]
    assert await mfa_state.is_mfa_required(db, USER) is True


# ── caching ─────────────────────────────────────────────────────────────────

async def test_repeat_reads_hit_the_cache():
    """Otherwise this is a database round-trip on every authenticated request —
    exactly the cost local token verification removed."""
    db = FakeDB([{"mfa_enabled": True}])
    for _ in range(5):
        assert await mfa_state.is_mfa_required(db, USER) is True
    assert db.queries == 1


async def test_invalidate_forces_a_fresh_read():
    db = FakeDB([{"mfa_enabled": True}])
    assert await mfa_state.is_mfa_required(db, USER) is True
    mfa_state.invalidate(USER)
    db._rows = [{"mfa_enabled": False}]
    assert await mfa_state.is_mfa_required(db, USER) is False
    assert db.queries == 2


async def test_a_profile_with_no_row_is_not_gated():
    db = FakeDB([])
    assert await mfa_state.is_mfa_required(db, USER) is False


# ── the dependency itself ───────────────────────────────────────────────────

class Creds:
    def __init__(self, token: str = "tok"):
        self.credentials = token


def _claims(aal: str) -> TokenClaims:
    return TokenClaims(sub=USER, email="a@b.c", aal=aal, amr=("password",),
                       session_id="s", expires_at=9_999_999_999)


@pytest.fixture
def _verified(monkeypatch):
    def install(aal: str):
        async def fake(_token):
            return _claims(aal)

        monkeypatch.setattr(auth_mod, "verify_access_token", fake)

    return install


async def test_aal1_with_mfa_on_is_refused(monkeypatch, _verified):
    _verified("aal1")

    async def required(_db, _uid):
        return True

    monkeypatch.setattr(auth_mod, "is_mfa_required", required)
    with pytest.raises(HTTPException) as exc:
        await auth_mod.get_claims(Creds(), db=None)

    assert exc.value.status_code == 403
    # A distinct signal, so the client doesn't have to string-match the message.
    assert exc.value.headers.get("X-MFA-Required") == "1"


async def test_aal1_without_mfa_is_allowed(monkeypatch, _verified):
    _verified("aal1")

    async def not_required(_db, _uid):
        return False

    monkeypatch.setattr(auth_mod, "is_mfa_required", not_required)
    assert (await auth_mod.get_claims(Creds(), db=None)).sub == USER


async def test_aal2_skips_the_lookup_entirely(monkeypatch, _verified):
    """A token that already cleared the factor needs no state read — which is
    what keeps the gate free for the people who turned 2FA on."""
    _verified("aal2")

    async def boom(_db, _uid):
        raise AssertionError("must not be called for an aal2 token")

    monkeypatch.setattr(auth_mod, "is_mfa_required", boom)
    assert (await auth_mod.get_claims(Creds(), db=None)).aal == "aal2"


async def test_a_broken_lookup_fails_closed(monkeypatch, _verified):
    """Failing open here would switch 2FA off for everyone — the one outcome
    this gate exists to prevent. 503 says it's our problem, not a bad token."""
    _verified("aal1")

    async def broken(_db, _uid):
        raise OtherDbError()

    monkeypatch.setattr(auth_mod, "is_mfa_required", broken)
    with pytest.raises(HTTPException) as exc:
        await auth_mod.get_claims(Creds(), db=None)
    assert exc.value.status_code == 503

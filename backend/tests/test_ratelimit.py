"""
Rate limiting — the budgets, and the two ways a limiter can be worse than none.

A limiter that counts the wrong events either does nothing (too loose) or becomes
the attack itself (locking a victim out of their own account). Both are covered
here, because both are easy to write by accident.
"""
import pytest
from fastapi import HTTPException

from app import ratelimit
from app.ratelimit import BUDGETS, check_only, consume, enforce


@pytest.fixture(autouse=True)
def _clean():
    ratelimit.reset_all()
    yield
    ratelimit.reset_all()


def _spend(name: str, key: str, n: int) -> None:
    for _ in range(n):
        enforce(name, key)


def test_allows_up_to_the_limit_then_refuses():
    limit = BUDGETS["signup_ip"].limit
    _spend("signup_ip", "1.2.3.4", limit)

    with pytest.raises(HTTPException) as exc:
        enforce("signup_ip", "1.2.3.4")
    assert exc.value.status_code == 429


def test_429_tells_the_client_when_to_come_back():
    _spend("signup_ip", "1.2.3.4", BUDGETS["signup_ip"].limit)
    with pytest.raises(HTTPException) as exc:
        enforce("signup_ip", "1.2.3.4")

    retry = exc.value.headers.get("Retry-After")
    assert retry is not None and int(retry) > 0
    # The message is shown to a person, so it must not be a bare status name.
    assert isinstance(exc.value.detail, str) and len(exc.value.detail) > 20


def test_budgets_are_per_key_not_global():
    """One noisy IP must not lock out everyone else — the bug that turns a
    limiter into an outage."""
    _spend("signup_ip", "1.1.1.1", BUDGETS["signup_ip"].limit)
    with pytest.raises(HTTPException):
        enforce("signup_ip", "1.1.1.1")

    enforce("signup_ip", "2.2.2.2")  # a different client is unaffected


def test_budgets_do_not_bleed_into_each_other():
    _spend("signup_ip", "1.1.1.1", BUDGETS["signup_ip"].limit)
    # Same key, different budget: exhausting signup must not block resets.
    enforce("reset_ip", "1.1.1.1")


def test_sweep_survives_a_clock_that_steps_backwards(monkeypatch):
    """Found by the sweep test below. With wall-clock time, an NTP correction that
    stepped the clock back left the scheduler believing the next sweep was still
    in the future — it never reclaimed anything again, and the dict grew forever."""
    now = [1_000.0]
    monkeypatch.setattr(ratelimit.time, "monotonic", lambda: now[0])
    enforce("signup_ip", "10.0.0.1")

    now[0] -= 500  # the step monotonic() makes impossible
    enforce("signup_ip", "10.0.0.2")

    # Far enough forward that .2's window has closed but .1's has not.
    now[0] += BUDGETS["signup_ip"].window_s + ratelimit._SWEEP_EVERY_S + 1
    enforce("signup_ip", "10.0.0.3")

    # The sweep ran at all — that's the assertion. It reclaimed the genuinely
    # expired bucket and left the one still inside its window alone.
    assert "signup_ip:10.0.0.2" not in ratelimit._buckets
    assert "signup_ip:10.0.0.1" in ratelimit._buckets


def test_window_expiry_restores_the_budget(monkeypatch):
    now = [1_000_000.0]
    monkeypatch.setattr(ratelimit.time, "monotonic", lambda: now[0])

    _spend("signup_ip", "1.2.3.4", BUDGETS["signup_ip"].limit)
    with pytest.raises(HTTPException):
        enforce("signup_ip", "1.2.3.4")

    now[0] += BUDGETS["signup_ip"].window_s + 1
    enforce("signup_ip", "1.2.3.4")  # a new window, not a permanent ban


def test_check_only_does_not_spend():
    """Login checks before attempting and spends only on failure. If check_only
    consumed, signing in successfully would ratchet you toward a lockout."""
    for _ in range(BUDGETS["login_email"].limit * 3):
        check_only("login_email", "a@b.c")

    consume("login_email", "a@b.c")
    check_only("login_email", "a@b.c")  # still fine — exactly one failure so far


def test_repeated_failures_do_eventually_refuse():
    for _ in range(BUDGETS["login_email"].limit):
        consume("login_email", "a@b.c")

    with pytest.raises(HTTPException) as exc:
        check_only("login_email", "a@b.c")
    assert exc.value.status_code == 429


def test_failing_one_account_cannot_lock_out_another():
    """The lockout-as-attack case. Per-email budgets are what make this safe;
    a single global login budget would fail this test."""
    for _ in range(BUDGETS["login_email"].limit * 2):
        consume("login_email", "victim@example.com")

    with pytest.raises(HTTPException):
        check_only("login_email", "victim@example.com")

    check_only("login_email", "someone-else@example.com")


def test_ip_budget_still_catches_a_spray_across_many_accounts():
    """The flip side: per-email alone would let one attacker try a handful of
    passwords against unlimited accounts."""
    ip = "9.9.9.9"
    for i in range(BUDGETS["login_ip"].limit):
        consume("login_ip", ip)

    with pytest.raises(HTTPException):
        check_only("login_ip", ip)


def test_expired_buckets_are_swept(monkeypatch):
    """Without a sweep the process keeps one entry per IP that ever connected."""
    now = [1_000_000.0]
    monkeypatch.setattr(ratelimit.time, "monotonic", lambda: now[0])

    for i in range(50):
        enforce("signup_ip", f"10.0.0.{i}")
    assert len(ratelimit._buckets) == 50

    now[0] += BUDGETS["signup_ip"].window_s + ratelimit._SWEEP_EVERY_S + 1
    enforce("signup_ip", "10.1.0.1")
    assert len(ratelimit._buckets) == 1


class _Req:
    def __init__(self, headers: dict, host: str | None):
        self.headers = headers
        self.client = type("C", (), {"host": host})() if host else None


def test_forwarded_for_is_ignored_without_a_trusted_proxy(monkeypatch):
    """Anyone can send X-Forwarded-For. Honouring it unconditionally hands every
    caller an unlimited supply of fresh rate-limit keys."""
    monkeypatch.setattr(ratelimit.settings, "trusted_proxy", False)
    req = _Req({"x-forwarded-for": "1.2.3.4"}, "10.0.0.1")
    assert ratelimit.client_ip(req) == "10.0.0.1"


def test_forwarded_for_takes_the_last_hop_when_trusted(monkeypatch):
    """The client controls the LEFT of the chain; the nearest trusted proxy
    appends on the right. Taking [0] — the common mistake — is spoofable."""
    monkeypatch.setattr(ratelimit.settings, "trusted_proxy", True)
    req = _Req({"x-forwarded-for": "evil-spoof, 203.0.113.9"}, "10.0.0.1")
    assert ratelimit.client_ip(req) == "203.0.113.9"


def test_client_ip_survives_a_missing_client():
    assert ratelimit.client_ip(_Req({}, None)) == "unknown"


def test_every_budget_is_sane():
    for name, budget in BUDGETS.items():
        assert budget.limit > 0, name
        assert budget.window_s > 0, name
        assert budget.message, name

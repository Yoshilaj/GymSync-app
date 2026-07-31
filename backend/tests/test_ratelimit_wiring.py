"""
Are the limiters actually attached to the routes?

app/ratelimit.py can be perfect and protect nothing. This file exists because that
happened during development: an edit to plans.py landed the import and the Request
parameter but not the enforce() call, so /plans/generate-anonymous — unauthenticated
and calling the model on every request — shipped with no limit at all. Nothing else
would have caught it; the unit tests passed and the module looked wired.

Asserting on source text is crude, and that is the point: it fails when the call
disappears, which is the failure mode that actually occurs.
"""
import inspect

import pytest

from app.ratelimit import BUDGETS
from app.routers import account as account_router
from app.routers import auth as auth_router
from app.routers import plans as plans_router

# route function → the budget names it must reference.
PROTECTED = [
    (auth_router.signup, ["signup_ip"]),
    (auth_router.login, ["login_email", "login_ip"]),
    (auth_router.reset_password, ["reset_email", "reset_ip"]),
    (auth_router.change_password, ["password_change"]),
    (auth_router.confirm_reset, ["password_change"]),
    (auth_router.sync_mfa_state, ["mfa_state"]),
    # Both budgets, deliberately: per-IP is the everyday limit, the global one is
    # the circuit breaker for a caller who has more than one IP. Losing either
    # silently would leave the route looking protected.
    (
        plans_router.generate_plan_anonymous,
        ["generate_anonymous_ip", "generate_anonymous_global"],
    ),
    (account_router.delete_account, ["password_change"]),
]


@pytest.mark.parametrize(
    "func,budgets", PROTECTED, ids=[f.__name__ for f, _ in PROTECTED]
)
def test_route_is_rate_limited(func, budgets):
    source = inspect.getsource(func)
    for budget in budgets:
        assert f'"{budget}"' in source, (
            f"{func.__name__} never references the {budget!r} budget — the limiter "
            f"is not wired to this route"
        )
    assert any(call in source for call in ("enforce(", "check_only(")), (
        f"{func.__name__} names a budget but never calls the limiter"
    )


def test_login_spends_budget_only_on_failure():
    """check_only at the top, consume in the except branch. If login used
    enforce() instead, every successful sign-in would count toward a lockout."""
    source = inspect.getsource(auth_router.login)
    assert "check_only(" in source
    assert "consume(" in source
    assert "enforce(" not in source


def test_every_budget_defined_is_actually_used():
    """A budget nobody references is a limit that doesn't exist."""
    used = set()
    for func, _ in PROTECTED:
        source = inspect.getsource(func)
        used.update(name for name in BUDGETS if f'"{name}"' in source)
    assert used == set(BUDGETS), f"unused budgets: {set(BUDGETS) - used}"

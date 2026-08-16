"""The pre-signup onboarding path: adopt charges the plan-generation allowance
once, and accept must not charge it again.

Regression for the 2026-08-16 lockout: accept re-checked the quota that adopt
had just spent, so every fresh free account (1 lifetime generation) got 403 on
its first Start training. Chat-coach proposals have no adopt step — accept is
their only charge point and must stay metered.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.routers.plans import AdoptRequest, accept_proposal, adopt_proposal
from tests.fake_supabase import FakeDB

USER = str(uuid.uuid4())

# No rationale on purpose: accept only writes a plan-rationale memory (which
# needs the embedder) when one is present, and these tests are about metering.
PLAN = {
    "name": "Push Pull Legs",
    "split_type": "ppl",
    "days": [
        {
            "day_label": "Mon",
            "title": "Push",
            "est_minutes": 60,
            "exercises": [
                {"exercise_name": "Bench Press", "sets": 3, "reps": "8"},
            ],
        },
    ],
}


@pytest.fixture
def db() -> FakeDB:
    return FakeDB()


async def test_fresh_free_account_can_accept_its_adopted_plan(db):
    adopted = await adopt_proposal(AdoptRequest(plan=PLAN), USER, db)
    res = await accept_proposal(adopted["proposal_id"], USER, db)

    assert res["plan"]["plan_id"]
    active = [p for p in db.tables["workout_plans"] if p.get("is_active")]
    assert len(active) == 1
    accepted = [p for p in db.tables["plan_proposals"] if p["status"] == "accepted"]
    assert len(accepted) == 1


async def test_adopt_plus_accept_spends_exactly_one_generation(db):
    adopted = await adopt_proposal(AdoptRequest(plan=PLAN), USER, db)
    await accept_proposal(adopted["proposal_id"], USER, db)

    usage = [
        r
        for r in db.tables.get("feature_usage", [])
        if r["user_id"] == USER and r["feature"] == "plan_generation"
    ]
    assert len(usage) == 1
    assert usage[0]["count"] == 1


async def test_chat_proposal_accept_is_still_metered(db):
    # Free user already spent their one generation through onboarding…
    adopted = await adopt_proposal(AdoptRequest(plan=PLAN), USER, db)
    await accept_proposal(adopted["proposal_id"], USER, db)

    # …then the chat coach proposes another plan (no adopt step, no origin
    # marker). Accepting it must hit the cap, not ride the pre-paid exemption.
    db.tables["plan_proposals"].append(
        {
            "id": "chat-proposal-1",
            "user_id": USER,
            "status": "pending",
            "payload": {"name": "Coach plan", "days": PLAN["days"]},
        }
    )
    with pytest.raises(HTTPException) as exc:
        await accept_proposal("chat-proposal-1", USER, db)
    assert exc.value.status_code == 403
    # A refused accept leaves the proposal pending, retryable after upgrade.
    row = [p for p in db.tables["plan_proposals"] if p["id"] == "chat-proposal-1"][0]
    assert row["status"] == "pending"


async def test_accept_unknown_proposal_is_404(db):
    with pytest.raises(HTTPException) as exc:
        await accept_proposal(str(uuid.uuid4()), USER, db)
    assert exc.value.status_code == 404

"""log_set stores kilograms and says back what it heard.

The live failure this pins: a user whose app is set to pounds said "75 kg". The
model correctly passed weight_unit="kg" and the row was stored as 75 kg — then
the app showed 75 lbs, because the app_action sent to the client carried a bare
number with no unit at all, and the client rendered it in the profile unit.

Two separate guarantees here, and both have to hold:
  1. whatever unit was spoken, the DATABASE gets kilograms
  2. the client is told the unit, so it can't guess wrong
"""
import pytest

from app.agents.tools import ToolContext, execute_tool
from tests.fake_supabase import FakeDB

USER = "user-1"
SESSION = "session-1"


@pytest.fixture
def db() -> FakeDB:
    fake = FakeDB()
    fake.tables["workout_sessions"] = [{"id": SESSION, "user_id": USER}]
    fake.tables["completed_sets"] = []
    # The app displays pounds — the condition under which the bug appeared.
    fake.tables["profiles"] = [{"user_id": USER, "units": "lbs"}]
    fake.tables["exercises"] = [
        {"id": "ex-bench", "name": "Barbell Bench Press", "is_active": True}
    ]
    return fake


def _ctx(db: FakeDB) -> ToolContext:
    return ToolContext(user_id=USER, session_id=SESSION, db=db)


async def _log(db: FakeDB, **args) -> dict:
    result, _ = await execute_tool("log_set", args, _ctx(db))
    return result


async def test_spoken_kg_is_stored_as_kg(db):
    await _log(db, exercise_name="Barbell Bench Press", reps=5, weight=75, weight_unit="kg")
    row = db.tables["completed_sets"][0]
    assert row["weight"] == 75
    assert row["weight_unit"] == "kg"


async def test_spoken_lbs_is_converted_before_storage(db):
    """165 lbs must not land in the table as the number 165."""
    await _log(db, exercise_name="Barbell Bench Press", reps=5, weight=165, weight_unit="lbs")
    row = db.tables["completed_sets"][0]
    assert row["weight"] == pytest.approx(74.84, abs=0.01)
    assert row["weight_unit"] == "kg"


async def test_bare_number_uses_the_profile_unit(db):
    """No unit spoken and the app is in pounds — 165 means 165 lbs, not 165 kg."""
    await _log(db, exercise_name="Barbell Bench Press", reps=5, weight=165)
    row = db.tables["completed_sets"][0]
    assert row["weight"] == pytest.approx(74.84, abs=0.01)


async def test_the_client_is_told_the_unit(db):
    """The app_action carried no unit at all, which is what made 75kg show as
    75lbs. Whatever else changes, this field must survive."""
    _, actions = await execute_tool(
        "log_set",
        {"exercise_name": "Barbell Bench Press", "reps": 5, "weight": 75, "weight_unit": "kg"},
        _ctx(db),
    )
    log = next(a for a in actions if a.get("action") == "log_set")
    assert log["weight_unit"] == "kg"
    assert log["weight"] == 75


async def test_mismatched_unit_is_confirmed_in_both(db):
    """Saying kg while the app is in pounds is usually a slip. The coach names
    both so it's caught immediately, without an extra question mid-set."""
    result = await _log(
        db, exercise_name="Barbell Bench Press", reps=5, weight=75, weight_unit="kg"
    )
    assert "75 kg" in result["confirm_weight"]
    assert "165" in result["confirm_weight"]


async def test_matching_unit_is_confirmed_plainly(db):
    """No conversion to announce — don't clutter the acknowledgement."""
    result = await _log(
        db, exercise_name="Barbell Bench Press", reps=5, weight=165, weight_unit="lbs"
    )
    assert result["confirm_weight"] == "165 lbs"
    assert "kg" not in result["confirm_weight"]


async def test_bodyweight_set_has_no_weight_to_confirm(db):
    result = await _log(db, exercise_name="Barbell Bench Press", reps=12)
    assert "confirm_weight" not in result
    assert "weight" not in db.tables["completed_sets"][0]

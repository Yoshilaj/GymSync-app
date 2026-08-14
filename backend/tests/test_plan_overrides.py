"""Per-date workout overrides (migration 019): edit one day, not every week.

The contract under test: an override is the complete exercise list for one
(workout, calendar day); upserts replace it idempotently; ownership follows
the same 404-shape as the rest of the plan routes; and the active-plan tree
carries overrides alongside — never inside — the template workouts.
"""
import pytest
from fastapi import HTTPException

from app.routers.plans import (
    WorkoutOverrideRequest,
    delete_workout_override,
    get_active_plan,
    put_workout_override,
)
from datetime import date

from tests.fake_supabase import FakeDB

OWNER = "user-owner"
STRANGER = "user-stranger"
PLAN = "plan-1"
WORKOUT = "workout-upper-a"
DAY = date(2026, 8, 24)

EXERCISES = [
    {
        "id": "pe-1",
        "exercise_id": "ex-bench",
        "exercise_name": "Bench Press",
        "target_sets": [{"id": "s1", "exerciseId": "ex-bench", "targetReps": 8, "weight": 60}],
        "note": None,
        "sort_order": 0,
    }
]


@pytest.fixture
def db() -> FakeDB:
    fake = FakeDB()
    fake.tables["workout_plans"] = [
        {"id": PLAN, "user_id": OWNER, "name": "Plan", "is_active": True}
    ]
    fake.tables["plan_workouts"] = [
        {"id": WORKOUT, "plan_id": PLAN, "user_id": OWNER, "day_label": "Mon",
         "title": "Upper A", "est_minutes": 60, "sort_order": 0}
    ]
    fake.tables["plan_exercises"] = []
    fake.tables["plan_workout_overrides"] = []
    return fake


async def test_put_creates_override(db):
    res = await put_workout_override(
        WORKOUT, DAY, WorkoutOverrideRequest(exercises=EXERCISES), OWNER, db
    )
    assert res["override"]["day"] == DAY.isoformat()
    assert res["override"]["exercises"] == EXERCISES
    assert len(db.tables["plan_workout_overrides"]) == 1


async def test_put_replaces_not_stacks(db):
    await put_workout_override(WORKOUT, DAY, WorkoutOverrideRequest(exercises=EXERCISES), OWNER, db)
    await put_workout_override(WORKOUT, DAY, WorkoutOverrideRequest(exercises=[]), OWNER, db)
    rows = db.tables["plan_workout_overrides"]
    assert len(rows) == 1
    assert rows[0]["exercises"] == []


async def test_put_foreign_workout_is_404(db):
    with pytest.raises(HTTPException) as e:
        await put_workout_override(
            WORKOUT, DAY, WorkoutOverrideRequest(exercises=EXERCISES), STRANGER, db
        )
    assert e.value.status_code == 404


async def test_template_untouched(db):
    await put_workout_override(WORKOUT, DAY, WorkoutOverrideRequest(exercises=EXERCISES), OWNER, db)
    assert db.tables["plan_exercises"] == []


async def test_delete_reverts_day(db):
    await put_workout_override(WORKOUT, DAY, WorkoutOverrideRequest(exercises=EXERCISES), OWNER, db)
    res = await delete_workout_override(WORKOUT, DAY, OWNER, db)
    assert res["status"] == "cleared"
    assert db.tables["plan_workout_overrides"] == []


async def test_delete_absent_is_404(db):
    with pytest.raises(HTTPException) as e:
        await delete_workout_override(WORKOUT, DAY, OWNER, db)
    assert e.value.status_code == 404


async def test_active_plan_carries_overrides_beside_template(db):
    await put_workout_override(WORKOUT, DAY, WorkoutOverrideRequest(exercises=EXERCISES), OWNER, db)
    res = await get_active_plan(OWNER, db)
    plan = res["plan"]
    assert plan["overrides"][0]["plan_workout_id"] == WORKOUT
    assert plan["overrides"][0]["day"] == DAY.isoformat()
    # The template workout itself is unchanged — overrides live beside it.
    assert plan["workouts"][0]["exercises"] == []

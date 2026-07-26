"""
Durable workout-plan storage — the ONE code path that reads/writes the
normalized plan tables (workout_plans → plan_workouts → plan_exercises).

Consumers: routers/session.py (snapshot at session start), routers/plans.py
(active-plan read + proposal acceptance), agents/tools.py (get_workout_plan).

The tree shape returned here is identical to the session `plan_snapshot`
convention, and `target_sets` uses the frontend's camelCase PlannedSet shape
({id, exerciseId, targetReps, weight}) — the same convention the 002 backfill
established. Keep the two in lockstep.
"""
from datetime import datetime, timezone

from supabase import AsyncClient


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


async def build_plan_tree(plan_id: str, user_id: str, db: AsyncClient) -> dict | None:
    """Self-contained plan tree, or None when the plan doesn't exist / isn't theirs."""
    plan = (
        await db.table("workout_plans")
        .select("id, name, is_active")
        .eq("id", plan_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not plan.data:
        return None

    workouts = (
        await db.table("plan_workouts")
        .select("id, day_label, title, est_minutes, sort_order")
        .eq("plan_id", plan_id)
        .eq("user_id", user_id)
        .order("sort_order")
        .execute()
    )

    workout_ids = [w["id"] for w in (workouts.data or [])]
    exercises_by_workout: dict[str, list] = {}
    if workout_ids:
        ex = (
            await db.table("plan_exercises")
            .select("plan_workout_id, exercise_id, exercise_name, target_sets, note, sort_order")
            .in_("plan_workout_id", workout_ids)
            .order("sort_order")
            .execute()
        )
        for row in ex.data or []:
            exercises_by_workout.setdefault(row["plan_workout_id"], []).append(row)

    return {
        "plan_id": plan.data[0]["id"],
        "name": plan.data[0]["name"],
        "is_active": plan.data[0]["is_active"],
        "workouts": [
            {**w, "exercises": exercises_by_workout.get(w["id"], [])}
            for w in (workouts.data or [])
        ],
    }


async def get_active_plan_id(user_id: str, db: AsyncClient) -> str | None:
    res = (
        await db.table("workout_plans")
        .select("id")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    return res.data[0]["id"] if res.data else None


async def get_active_plan_tree(user_id: str, db: AsyncClient) -> dict | None:
    plan_id = await get_active_plan_id(user_id, db)
    if plan_id is None:
        return None
    return await build_plan_tree(plan_id, user_id, db)


def _target_sets_json(exercise: dict) -> list[dict]:
    """Materialize {sets, reps_low, reps_high?} into the PlannedSet convention."""
    sets = []
    for i in range(int(exercise.get("sets", 3))):
        s: dict = {
            "id": f"s{i + 1}",
            "exerciseId": exercise.get("exercise_id") or "",
            "targetReps": exercise.get("reps_low", 8),
            "weight": None,
        }
        if exercise.get("reps_high"):
            s["repsHigh"] = exercise["reps_high"]
        sets.append(s)
    return sets


async def materialize_proposal(user_id: str, payload: dict, db: AsyncClient) -> dict:
    """
    Persist an accepted proposal as the user's new ACTIVE plan and return its
    tree. Supabase REST has no transactions: on a child-insert failure the
    workout_plans row is deleted (FK cascade removes children) and we re-raise.
    """
    await db.table("workout_plans").update(
        {"is_active": False, "updated_at": _utcnow()}
    ).eq("user_id", user_id).eq("is_active", True).execute()

    plan_res = (
        await db.table("workout_plans")
        .insert({"user_id": user_id, "name": payload.get("name") or "My plan", "is_active": True})
        .execute()
    )
    plan_id = plan_res.data[0]["id"]

    try:
        for day_idx, day in enumerate(payload.get("days") or []):
            workout_res = (
                await db.table("plan_workouts")
                .insert(
                    {
                        "plan_id": plan_id,
                        "user_id": user_id,
                        "day_label": day.get("day_label") or f"Day {day_idx + 1}",
                        "title": day.get("title") or "Workout",
                        "est_minutes": day.get("est_minutes"),
                        "sort_order": day_idx,
                    }
                )
                .execute()
            )
            workout_id = workout_res.data[0]["id"]

            rows = [
                {
                    "plan_workout_id": workout_id,
                    "user_id": user_id,
                    "exercise_id": ex.get("exercise_id"),
                    "exercise_name": ex.get("exercise_name") or "Exercise",
                    "target_sets": _target_sets_json(ex),
                    "note": ex.get("note"),
                    "sort_order": ex_idx,
                }
                for ex_idx, ex in enumerate(day.get("exercises") or [])
            ]
            if rows:
                await db.table("plan_exercises").insert(rows).execute()
    except Exception:
        await db.table("workout_plans").delete().eq("id", plan_id).execute()
        raise

    tree = await build_plan_tree(plan_id, user_id, db)
    assert tree is not None  # we just created it
    return tree

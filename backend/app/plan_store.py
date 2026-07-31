"""
Durable workout-plan storage — the ONE code path that reads/writes the
normalized plan tables (workout_plans → plan_workouts → plan_exercises).

Consumers: routers/session.py (snapshot at session start), routers/plans.py
(active-plan read, proposal acceptance, and per-exercise edits from the Plan
tab), agents/tools.py (get_workout_plan).

Accepting a proposal replaces the whole plan; add/delete_plan_exercise edit
the active one in place. Everything the COACH changes mid-workout is a session
override, not a plan write — see agents/tools.py.

The tree shape returned here is identical to the session `plan_snapshot`
convention, and `target_sets` uses the frontend's camelCase PlannedSet shape
({id, exerciseId, targetReps, weight}) — the same convention the 002 backfill
established. Keep the two in lockstep.
"""
import logging
from datetime import datetime, timezone

from supabase import AsyncClient

from app import progression

logger = logging.getLogger(__name__)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


async def build_plan_tree(
    plan_id: str, user_id: str, db: AsyncClient, tier: str = "free"
) -> dict | None:
    """Self-contained plan tree, or None when the plan doesn't exist / isn't theirs.

    Target weights are seeded from the user's own history on the way out — see
    `_seed_targets`. `tier` decides how clever that seeding is, so callers pass what
    they know; "free" is the conservative default.
    """
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
            .select(
                "id, plan_workout_id, exercise_id, exercise_name, "
                "target_sets, note, sort_order"
            )
            .in_("plan_workout_id", workout_ids)
            .order("sort_order")
            .execute()
        )
        for row in ex.data or []:
            exercises_by_workout.setdefault(row["plan_workout_id"], []).append(row)

    tree = {
        "plan_id": plan.data[0]["id"],
        "name": plan.data[0]["name"],
        "is_active": plan.data[0]["is_active"],
        "workouts": [
            {**w, "exercises": exercises_by_workout.get(w["id"], [])}
            for w in (workouts.data or [])
        ],
    }
    return await _seed_targets(tree, user_id, db, tier)


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


async def get_active_plan_tree(
    user_id: str, db: AsyncClient, tier: str = "free"
) -> dict | None:
    plan_id = await get_active_plan_id(user_id, db)
    if plan_id is None:
        return None
    return await build_plan_tree(plan_id, user_id, db, tier)


# How far back to look when seeding weights. Same window core.py uses for the history
# digest — enough for a month of training on any sane split.
_HISTORY_ROWS = 400


async def _seed_targets(tree: dict, user_id: str, db: AsyncClient, tier: str) -> dict:
    """Fill each planned set's `weight` from what the user actually lifted.

    Every workout used to open with an empty weight field, on every exercise, forever —
    `_target_sets_json` writes `"weight": None` at plan-creation time and nothing ever
    revisited it. So the app knew you benched 60kg on Tuesday and still asked you on
    Thursday.

    Two tiers of answer, which is exactly where the Premium line falls:
      • everyone      — "what you lifted last time", straight recall.
      • Premium       — `next_target`: double progression, plus the stall/deload verdict
                        attached as `progression` for the coach to talk about.

    Best-effort: a failure here leaves the plan exactly as it was.
    """
    workouts = tree.get("workouts") or []
    if not workouts:
        return tree

    try:
        res = (
            await db.table("completed_sets")
            .select("exercise_name, reps, weight, weight_unit, logged_at")
            .eq("user_id", user_id)
            .order("logged_at", desc=True)
            .limit(_HISTORY_ROWS)
            .execute()
        )
        rows = res.data or []
    except Exception:
        logger.warning("target seeding: history read failed", exc_info=True)
        return tree
    if not rows:
        return tree

    recall = progression.last_performance(rows)

    for workout in workouts:
        for ex in workout.get("exercises") or []:
            sets = ex.get("target_sets") or []
            if not sets:
                continue
            name = ex.get("exercise_name") or ""
            first = sets[0] or {}
            reps_low = first.get("targetReps") or 8
            reps_high = first.get("repsHigh")

            if tier == "premium":
                hint = progression.next_target(
                    rows, name, reps_low=reps_low, reps_high=reps_high
                )
                if hint:
                    ex["progression"] = hint
                weight = hint["weight"] if hint else None
            else:
                weight = (recall.get(name.strip().lower()) or {}).get("weight")

            if weight is None:
                continue
            for s in sets:
                # Never overwrite a weight someone deliberately set.
                if s.get("weight") is None:
                    s["weight"] = weight

    return tree


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


# A hand-added exercise gets a neutral prescription — the real reps and weight
# are settled in the live session. Matches the coach's own session-add default.
# ExerciseRow renders "N Sets × R Reps" with no range support, so a single
# number is honest where a range would silently display as its low end.
DEFAULT_ADDED_SETS = 3
DEFAULT_ADDED_REPS = 10


async def _owned_active_workout(
    plan_workout_id: str, user_id: str, db: AsyncClient
) -> tuple[str | None, str | None]:
    """(plan_id, error) where error is 'not_found' or 'stale'.

    The user_id filter is the ONLY isolation boundary: database.py builds the
    client with the service-role key, so RLS never runs here.
    """
    res = (
        await db.table("plan_workouts")
        .select("id, plan_id")
        .eq("id", plan_workout_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None, "not_found"
    plan_id = res.data[0]["plan_id"]
    if plan_id != await get_active_plan_id(user_id, db):
        return None, "stale"
    return plan_id, None


async def _resolve_catalog_id(
    exercise_id: str | None, exercise_name: str, db: AsyncClient
) -> str | None:
    """An id that really exists in `exercises`, or None for an ad-hoc row.

    The client picks from a static catalog file that has drifted from the seed
    (10 of its ids have no row), and plan_exercises.exercise_id is a real FK —
    so an unchecked insert would fail for roughly one pick in five. Falling
    back to a named ad-hoc row is invisible to the user: exercise_name is
    always stored, and resolvePlannedExercise recovers the rest by name.
    """
    if exercise_id:
        hit = (
            await db.table("exercises")
            .select("id")
            .eq("id", exercise_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if hit.data:
            return exercise_id
    if exercise_name:
        # Same case-insensitive name lookup the agent tools use.
        hit = (
            await db.table("exercises")
            .select("id")
            .ilike("name", exercise_name)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if hit.data:
            return hit.data[0]["id"]
    return None


async def add_plan_exercise(
    user_id: str,
    plan_workout_id: str,
    exercise_id: str | None,
    exercise_name: str,
    db: AsyncClient,
    note: str | None = None,
) -> dict:
    """Append one exercise to a day of the user's ACTIVE plan.

    Raises ValueError('not_found' | 'stale' | 'duplicate'); the router maps
    those to HTTP.
    """
    _, err = await _owned_active_workout(plan_workout_id, user_id, db)
    if err:
        raise ValueError(err)

    resolved = await _resolve_catalog_id(exercise_id, exercise_name, db)

    # One of each per day. Matched on the resolved catalog id when there is
    # one, else on the name — an ad-hoc row has no id to compare.
    existing = (
        await db.table("plan_exercises")
        .select("exercise_id, exercise_name")
        .eq("plan_workout_id", plan_workout_id)
        .execute()
    )
    wanted_name = (exercise_name or "").strip().lower()
    for row in existing.data or []:
        same_id = resolved is not None and row.get("exercise_id") == resolved
        same_name = (row.get("exercise_name") or "").strip().lower() == wanted_name
        if same_id or same_name:
            raise ValueError("duplicate")

    last = (
        await db.table("plan_exercises")
        .select("sort_order")
        .eq("plan_workout_id", plan_workout_id)
        .order("sort_order", desc=True)
        .limit(1)
        .execute()
    )
    next_order = (last.data[0]["sort_order"] + 1) if last.data else 0

    row = {
        "plan_workout_id": plan_workout_id,
        "user_id": user_id,
        "exercise_id": resolved,
        "exercise_name": exercise_name,
        "target_sets": _target_sets_json(
            {
                "sets": DEFAULT_ADDED_SETS,
                "reps_low": DEFAULT_ADDED_REPS,
                "exercise_id": resolved,
            }
        ),
        "note": note,
        "sort_order": next_order,
    }
    try:
        res = await db.table("plan_exercises").insert(row).execute()
    except Exception:
        # Residual race: the catalog row was soft-deleted between the probe and
        # the insert. Retry once as ad-hoc so this can never surface as a 500.
        if row["exercise_id"] is None:
            raise
        row["exercise_id"] = None
        res = await db.table("plan_exercises").insert(row).execute()
    return res.data[0]


async def delete_plan_exercise(
    user_id: str, plan_exercise_id: str, db: AsyncClient
) -> bool:
    """Remove one plan exercise. False when it isn't there or isn't theirs.

    sort_order is deliberately NOT compacted afterwards: reads only need the
    order to be monotonic, not dense, and with no transactions available a
    half-finished renumber would be worse than any gap.
    """
    res = (
        await db.table("plan_exercises")
        .delete()
        .eq("id", plan_exercise_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(res.data)


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

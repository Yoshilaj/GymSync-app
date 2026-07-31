"""
Progress data — the honest numbers behind the Progress tab.

- POST /sets: persist a manually-completed set (mirrors the agent's log_set
  shape) so UI-logged training counts toward stats, not just voice-logged.
- GET /progress/summary: streak / days-this-week / PRs-this-month, computed
  from completed_sets. Zeros for a fresh account — never mock numbers.
- GET /progress/exercise/{id}: per-day series for the trends chart
  (strength = best Epley 1RM that day, volume = total reps×weight).
- POST/GET /bodyweight: daily body-weight log (upsert per day) feeding the
  body-weight chart; also mirrors profiles.weight_kg so the profile stays
  current.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app import plan_store
from app.auth import get_current_user_id
from app.database import get_db
from app.session_store import assert_session_owner

router = APIRouter(tags=["progress"])


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Manual set logging ────────────────────────────────────────────────────────

class SetLog(BaseModel):
    session_id: str
    exercise_id: str | None = None
    exercise_name: str
    set_index: int = Field(ge=0)
    reps: int = Field(ge=1, le=200)
    weight: float | None = Field(None, ge=0)
    weight_unit: str = "lbs"


@router.post("/sets", status_code=201)
async def log_set(
    body: SetLog,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    # The session id comes from the request body, so prove it's the caller's before
    # writing anything. The upsert below conflicts on (session_id, exercise_name,
    # set_index) — a key that does NOT include user_id — so an unchecked write
    # against someone else's session would overwrite their set rather than fail.
    await assert_session_owner(body.session_id, user_id, db)

    # Resolve exercise_id server-side (same rule as the voice log_set) — the
    # client sends a name from its bundled catalog, and a stale id would
    # violate the FK and silently lose the set. Bodyweight names resolve too,
    # so "Bodyweight Squat" still charts against ex-squat.
    exercise_id = await plan_store.exercise_id_for_name(body.exercise_name, db)

    row: dict = {
        "user_id": user_id,
        "session_id": body.session_id,
        "exercise_id": exercise_id,
        "exercise_name": body.exercise_name,
        "set_index": body.set_index,
        "reps": body.reps,
    }
    if body.weight is not None:
        row["weight"] = body.weight
        row["weight_unit"] = body.weight_unit
    # Upsert on the slot key (migration 012): re-toggling a set updates the
    # existing row instead of stacking duplicates.
    res = await db.table("completed_sets").upsert(
        row, on_conflict="session_id,exercise_name,set_index"
    ).execute()
    return {"set": res.data[0] if res.data else row}


# ── Aggregates ────────────────────────────────────────────────────────────────

def _epley(weight: float, reps: int) -> float:
    return weight * (1 + reps / 30)


@router.get("/progress/summary")
async def progress_summary(
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    res = (
        await db.table("completed_sets")
        .select("exercise_name, weight, logged_at")
        .eq("user_id", user_id)
        .order("logged_at", desc=True)
        .limit(2000)
        .execute()
    )
    rows = res.data or []

    today = date.today()
    days_trained = {datetime.fromisoformat(r["logged_at"]).date() for r in rows}

    # Streak: consecutive training days ending today or yesterday.
    streak = 0
    cursor = today if today in days_trained else today - timedelta(days=1)
    while cursor in days_trained:
        streak += 1
        cursor -= timedelta(days=1)

    # Days trained this week (Sunday-first, matching the app's week).
    week_start = today - timedelta(days=(today.weekday() + 1) % 7)
    days_this_week = sum(1 for d in days_trained if d >= week_start)

    # PRs this month: sets whose weight beat the user's best BEFORE that set.
    month_start = today.replace(day=1)
    best_before: dict[str, float] = defaultdict(float)
    prs = 0
    for r in sorted(rows, key=lambda r: r["logged_at"]):
        w = r.get("weight")
        if w is None:
            continue
        name = r["exercise_name"]
        when = datetime.fromisoformat(r["logged_at"]).date()
        if when >= month_start and w > best_before[name] > 0:
            prs += 1
        best_before[name] = max(best_before[name], float(w))

    # Week target: the ACTIVE PLAN's day count is the source of truth (a 5-day
    # plan means n/5), falling back to the profile preference, then 4.
    week_target: int | None = None
    plan_id = await plan_store.get_active_plan_id(user_id, db)
    if plan_id:
        wk = (
            await db.table("plan_workouts")
            .select("id", count="exact")
            .eq("plan_id", plan_id)
            .execute()
        )
        week_target = wk.count or None
    if not week_target:
        prof = (
            await db.table("profiles")
            .select("training_days")
            .eq("user_id", user_id)
            .execute()
        )
        week_target = (prof.data[0].get("training_days") if prof.data else None) or 4

    # Most recently trained exercises (rows are already newest-first) — the
    # client uses [0] to default the trend chart to what the user just did.
    recent_exercises: list[str] = []
    for r in rows:
        name = r["exercise_name"]
        if name not in recent_exercises:
            recent_exercises.append(name)
        if len(recent_exercises) >= 10:
            break

    return {
        "current_streak": streak,
        "days_this_week": days_this_week,
        "week_target": week_target,
        "prs_this_month": prs,
        "recent_exercises": recent_exercises,
    }


@router.get("/progress/exercise/{exercise_id}")
async def exercise_series(
    exercise_id: str,
    metric: str = Query("strength", pattern="^(strength|volume)$"),
    days: int = Query(90, ge=7, le=365),
    name: str | None = Query(
        None,
        description="Exercise display name. Preferred filter: matches by "
        "exercise_name (case-insensitive), which BOTH logging paths reliably "
        "write — voice-logged sets often have exercise_id NULL.",
    ),
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    q = (
        db.table("completed_sets")
        .select("reps, weight, logged_at")
        .eq("user_id", user_id)
        .gte("logged_at", since)
        .order("logged_at")
    )
    # Name filter when provided (the id path segment stays for back-compat).
    q = q.ilike("exercise_name", name) if name else q.eq("exercise_id", exercise_id)
    res = await q.execute()
    by_day: dict[str, float] = defaultdict(float)
    for r in res.data or []:
        w = r.get("weight")
        if w is None:
            continue
        day = datetime.fromisoformat(r["logged_at"]).date().isoformat()
        if metric == "strength":
            by_day[day] = max(by_day[day], _epley(float(w), int(r["reps"])))
        else:
            by_day[day] += float(w) * int(r["reps"])
    points = [
        {"date": d, "value": round(v, 1)} for d, v in sorted(by_day.items())
    ]
    return {"metric": metric, "points": points}


# ── Body weight ───────────────────────────────────────────────────────────────

class BodyWeight(BaseModel):
    weight_kg: float = Field(ge=25, le=350)
    day: date | None = None  # defaults to today; lets the UI log past days


@router.post("/bodyweight")
async def log_bodyweight(
    body: BodyWeight,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    today = date.today()
    day = body.day or today
    await db.table("body_weight_logs").upsert(
        {"user_id": user_id, "day": day.isoformat(), "weight_kg": body.weight_kg},
        on_conflict="user_id,day",
    ).execute()
    # Keep the profile's snapshot current (used by the nutrition calc later) —
    # but only for today's entry; backfilling history shouldn't rewind it.
    if day == today:
        await db.table("profiles").update(
            {"weight_kg": body.weight_kg, "updated_at": _utcnow()}
        ).eq("user_id", user_id).execute()
    return {"day": day.isoformat(), "weight_kg": body.weight_kg}


@router.get("/bodyweight")
async def bodyweight_series(
    days: int = Query(60, ge=7, le=1095),
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    since = (date.today() - timedelta(days=days)).isoformat()
    res = (
        await db.table("body_weight_logs")
        .select("day, weight_kg")
        .eq("user_id", user_id)
        .gte("day", since)
        .order("day")
        .execute()
    )
    return {"points": res.data or []}

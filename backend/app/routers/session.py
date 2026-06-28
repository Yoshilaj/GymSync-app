from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import AsyncClient

from app.agents.tools import utcnow
from app.auth import get_current_user_id
from app.database import get_db

router = APIRouter(tags=["session"])


# ── Models ────────────────────────────────────────────────────────────────────

class SessionStart(BaseModel):
    plan_id: str | None = None  # if provided, snapshot is copied from workout_plans


class SessionPatch(BaseModel):
    current_exercise: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _end_existing_active_sessions(user_id: str, db: AsyncClient) -> None:
    await db.table("workout_sessions").update(
        {"is_active": False, "updated_at": utcnow()}
    ).eq("user_id", user_id).eq("is_active", True).execute()


async def _build_plan_snapshot(plan_id: str, user_id: str, db: AsyncClient) -> dict:
    """Reconstruct a self-contained plan snapshot from the normalized plan tables,
    so the session is unaffected if the user later edits the plan."""
    plan = await db.table("workout_plans").select("id, name").eq(
        "id", plan_id
    ).eq("user_id", user_id).single().execute()
    if not plan.data:
        raise HTTPException(status_code=404, detail="Plan not found")

    workouts = await db.table("plan_workouts").select(
        "id, day_label, title, est_minutes, sort_order"
    ).eq("plan_id", plan_id).eq("user_id", user_id).order("sort_order").execute()

    workout_ids = [w["id"] for w in (workouts.data or [])]
    exercises_by_workout: dict[str, list] = {}
    if workout_ids:
        ex = await db.table("plan_exercises").select(
            "plan_workout_id, exercise_id, exercise_name, target_sets, note, sort_order"
        ).in_("plan_workout_id", workout_ids).order("sort_order").execute()
        for row in ex.data or []:
            exercises_by_workout.setdefault(row["plan_workout_id"], []).append(row)

    return {
        "plan_id": plan.data["id"],
        "name": plan.data["name"],
        "workouts": [
            {**w, "exercises": exercises_by_workout.get(w["id"], [])}
            for w in (workouts.data or [])
        ],
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/session/active")
async def get_active_session(
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    res = await db.table("workout_sessions").select("*").eq(
        "user_id", user_id
    ).eq("is_active", True).limit(1).execute()
    if not res.data:
        return {"session": None}
    return {"session": res.data[0]}


@router.post("/session", status_code=201)
async def start_session(
    body: SessionStart,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    # Close any existing active session first (one active session per user).
    await _end_existing_active_sessions(user_id, db)

    plan_snapshot = None
    if body.plan_id:
        plan_snapshot = await _build_plan_snapshot(body.plan_id, user_id, db)

    res = await db.table("workout_sessions").insert(
        {
            "user_id": user_id,
            "is_active": True,
            "plan_snapshot": plan_snapshot,
            "chat_history": [],
        }
    ).execute()

    return {"session": res.data[0]}


@router.patch("/session/{session_id}")
async def update_session(
    session_id: str,
    body: SessionPatch,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = utcnow()

    res = await db.table("workout_sessions").update(updates).eq(
        "id", session_id
    ).eq("user_id", user_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session": res.data[0]}


@router.delete("/session/{session_id}", status_code=200)
async def end_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    res = await db.table("workout_sessions").update(
        {"is_active": False, "updated_at": utcnow()}
    ).eq("id", session_id).eq("user_id", user_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "ended", "session_id": session_id}

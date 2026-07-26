from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import AsyncClient

from app import plan_store
from app.agents.tools import utcnow
from app.auth import get_current_user_id
from app.database import get_db

router = APIRouter(tags=["session"])


# ── Models ────────────────────────────────────────────────────────────────────

class SessionStart(BaseModel):
    plan_id: str | None = None  # if provided, snapshot is copied from workout_plans
    workout_id: str | None = None  # which day of the plan the user opened


class SessionPatch(BaseModel):
    current_exercise: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _end_existing_active_sessions(user_id: str, db: AsyncClient) -> None:
    await db.table("workout_sessions").update(
        {"is_active": False, "updated_at": utcnow()}
    ).eq("user_id", user_id).eq("is_active", True).execute()


async def _build_plan_snapshot(plan_id: str, user_id: str, db: AsyncClient) -> dict:
    """Self-contained plan snapshot (plan_store owns the tree shape), so the
    session is unaffected if the user later edits the plan."""
    tree = await plan_store.build_plan_tree(plan_id, user_id, db)
    if tree is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return tree


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

    # No explicit plan_id → fall back to the user's active plan, so the coach
    # always sees the real program even for clients that don't pass one.
    plan_id = body.plan_id or await plan_store.get_active_plan_id(user_id, db)
    plan_snapshot = None
    if plan_id:
        plan_snapshot = await _build_plan_snapshot(plan_id, user_id, db)
        # Record which day is being trained — the coach's session context leads
        # with it instead of guessing the day from logged sets or the weekday.
        if body.workout_id and any(
            w.get("id") == body.workout_id for w in plan_snapshot.get("workouts", [])
        ):
            plan_snapshot["today_workout_id"] = body.workout_id

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

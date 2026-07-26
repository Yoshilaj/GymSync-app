"""
Workout plans — read the active plan, rehydrate/accept agent proposals.

Proposals are created ONLY by the agent's propose_workout_plan tool (a
plan_proposals row + a plan_proposal wire packet). Accepting one here is the
single consent gate that materializes it into the real plan tables.
Request-changes needs no endpoint: it's a chat message; the agent emits a
fresh proposal which supersedes the old pending row.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from supabase import AsyncClient

from app import plan_store
from app.agents.core import PlanGenerationError, run_plan_generation
from app.auth import get_current_user_id
from app.database import get_db

router = APIRouter(tags=["plans"])


@router.post("/plans/generate")
async def generate_plan(
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    """One-shot, chat-free plan generation (onboarding's final step)."""
    try:
        event = await run_plan_generation(user_id, db)
    except PlanGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "proposal_id": event["proposal_id"],
        "plan": event["plan"],
        "warnings": event.get("warnings", []),
    }


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/plans/active")
async def get_active_plan(
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    plan = await plan_store.get_active_plan_tree(user_id, db)
    return {"plan": plan}


@router.get("/plans/proposals/latest")
async def get_latest_proposal(
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    """The pending proposal, if any — lets the client re-render the chat card
    after an app reload (chat history only persists text)."""
    res = (
        await db.table("plan_proposals")
        .select("id, payload, created_at")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return {"proposal": res.data[0] if res.data else None}


@router.post("/plans/proposals/{proposal_id}/accept")
async def accept_proposal(
    proposal_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    # Guarded status flip: only a pending proposal owned by this user flips.
    # A repeat POST finds status != pending → 409, so double-taps are safe.
    flipped = (
        await db.table("plan_proposals")
        .update({"status": "accepted", "updated_at": _utcnow()})
        .eq("id", proposal_id)
        .eq("user_id", user_id)
        .eq("status", "pending")
        .execute()
    )
    if not flipped.data:
        exists = (
            await db.table("plan_proposals")
            .select("id, status")
            .eq("id", proposal_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not exists.data:
            raise HTTPException(status_code=404, detail="Proposal not found")
        raise HTTPException(
            status_code=409,
            detail=f"Proposal is {exists.data[0]['status']}, not pending",
        )

    try:
        tree = await plan_store.materialize_proposal(user_id, flipped.data[0]["payload"], db)
    except Exception:
        # Materialization failed — put the proposal back so Accept can retry.
        await db.table("plan_proposals").update(
            {"status": "pending", "updated_at": _utcnow()}
        ).eq("id", proposal_id).execute()
        raise

    await db.table("plan_proposals").update(
        {"accepted_plan_id": tree["plan_id"], "updated_at": _utcnow()}
    ).eq("id", proposal_id).execute()

    return {"plan": tree}

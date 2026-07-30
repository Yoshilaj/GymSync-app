"""
Workout plans — read the active plan, rehydrate/accept agent proposals.

Proposals are created ONLY by the agent's propose_workout_plan tool (a
plan_proposals row + a plan_proposal wire packet). Accepting one here is the
consent gate that materializes a WHOLE plan into the real tables; the Plan tab
edits the active one an exercise at a time (add/delete below).
Request-changes needs no endpoint: it's a chat message; the agent emits a
fresh proposal which supersedes the old pending row.
"""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app import plan_store
from app.agents.core import (
    PlanGenerationError,
    run_anonymous_plan_generation,
    run_plan_generation,
)
from app.auth import get_current_user_id
from app.database import get_db
from app.entitlements import PLAN_GENERATION, QuotaExceeded, check_quota, consume_quota

router = APIRouter(tags=["plans"])


@router.post("/plans/generate")
async def generate_plan(
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    """One-shot, chat-free plan generation (onboarding's final step).

    Metered: Free gets one plan generation, ever. Note this is only ONE of three
    ways a plan can be generated — see adopt_proposal below and the agent's
    propose_workout_plan tool. All three consume the same allowance, or the cap
    is decorative.
    """
    try:
        await check_quota(PLAN_GENERATION, user_id, db)
    except QuotaExceeded as exc:
        raise exc.as_http() from exc

    try:
        event = await run_plan_generation(user_id, db)
    except PlanGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # After the plan exists. A generation that failed upstream shouldn't spend
    # the only one a free user gets.
    await consume_quota(PLAN_GENERATION, user_id, db)

    return {
        "proposal_id": event["proposal_id"],
        "plan": event["plan"],
        "warnings": event.get("warnings", []),
    }


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class AnonymousProfile(BaseModel):
    """The onboarding answers, shaped like the profile row they'll become."""

    goals: list[str] = []
    experience: str | None = None
    training_days: int | None = Field(default=None, ge=1, le=7)
    session_minutes: int | None = Field(default=None, ge=10, le=240)
    equipment: list[str] = []
    sex: str | None = None
    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    activity_level: str | None = None
    height_cm: float | None = Field(default=None, ge=50, le=300)
    weight_kg: float | None = Field(default=None, ge=20, le=400)
    units: str | None = None
    injuries_note: str | None = Field(default=None, max_length=500)
    injury_areas: list[str] = []
    coach_preset: str | None = None


@router.post("/plans/generate-anonymous")
async def generate_plan_anonymous(
    body: AnonymousProfile,
    db: AsyncClient = Depends(get_db),
) -> dict:
    """Pre-signup generation for the onboarding reveal. Nothing persists —
    the client carries the plan across the auth boundary and POSTs
    /plans/proposals/adopt once the account exists.

    Deliberately unauthenticated: it runs before an account exists, so there is
    no user to meter. That is exactly why the allowance is enforced on
    /plans/proposals/adopt instead — otherwise a signed-in free user who spent
    their generation could call this with a hand-built profile and adopt the
    result, and the cap would mean nothing.
    """
    try:
        event = await run_anonymous_plan_generation(
            body.model_dump(), db, personality_preset=body.coach_preset
        )
    except PlanGenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"plan": event["plan"], "warnings": event.get("warnings", [])}


class AdoptRequest(BaseModel):
    plan: dict


@router.post("/plans/proposals/adopt")
async def adopt_proposal(
    body: AdoptRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    """Store a plan generated pre-signup as this user's pending proposal.
    The user already saw and implicitly chose this plan — regenerating after
    signup could silently swap it for a different one.

    Metered against the same allowance as /plans/generate: this is where an
    anonymously-generated plan becomes a real one, and it is the authenticated
    half of the pre-signup flow. A brand-new account has its full allowance, so
    normal onboarding passes straight through and spends its one free plan here.
    """
    try:
        await check_quota(PLAN_GENERATION, user_id, db)
    except QuotaExceeded as exc:
        raise exc.as_http() from exc

    plan = body.plan
    days = plan.get("days")
    if not isinstance(days, list) or not days:
        raise HTTPException(status_code=422, detail="Not a plan payload")
    payload = {
        "name": str(plan.get("name") or "My plan"),
        "split_type": str(plan.get("split_type") or ""),
        "rationale": str(plan.get("rationale") or ""),
        "days": days,
    }
    if len(json.dumps(payload)) > 100_000:
        raise HTTPException(status_code=422, detail="Plan payload too large")

    # Same one-pending-at-a-time rule the proposal tool enforces.
    await db.table("plan_proposals").update(
        {"status": "superseded", "updated_at": _utcnow()}
    ).eq("user_id", user_id).eq("status", "pending").execute()
    ins = await db.table("plan_proposals").insert(
        {"user_id": user_id, "payload": payload, "status": "pending"}
    ).execute()
    await consume_quota(PLAN_GENERATION, user_id, db)
    return {"proposal_id": ins.data[0]["id"], "plan": payload}


class AddPlanExerciseRequest(BaseModel):
    exercise_id: str | None = Field(default=None, max_length=100)
    exercise_name: str = Field(min_length=1, max_length=120)
    note: str | None = Field(default=None, max_length=500)


@router.post("/plans/workouts/{workout_id}/exercises", status_code=201)
async def add_plan_exercise(
    workout_id: str,
    body: AddPlanExerciseRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    """Append an exercise to a day of the caller's ACTIVE plan.

    The client picks from a static catalog that has drifted from this one, so
    an unknown exercise_id degrades to a named ad-hoc row instead of failing.
    """
    try:
        row = await plan_store.add_plan_exercise(
            user_id,
            workout_id,
            body.exercise_id,
            body.exercise_name,
            db,
            note=body.note,
        )
    except ValueError as exc:
        reason = str(exc)
        if reason == "duplicate":
            # 422, not 409: the plan is fine and refetching it would change
            # nothing — only this request was unprocessable. That split is
            # what lets the client skip a pointless refresh.
            raise HTTPException(
                status_code=422, detail="That exercise is already in this workout."
            ) from exc
        if reason == "stale":
            # Distinct from 404 on purpose: the client can act on this by
            # refreshing, where "not found" would just look like a bug.
            raise HTTPException(
                status_code=409, detail="That workout belongs to a superseded plan"
            ) from exc
        raise HTTPException(status_code=404, detail="Workout not found") from exc
    return {"exercise": row}


@router.delete("/plans/exercises/{plan_exercise_id}")
async def delete_plan_exercise(
    plan_exercise_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    ok = await plan_store.delete_plan_exercise(user_id, plan_exercise_id, db)
    if not ok:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return {"status": "deleted", "plan_exercise_id": plan_exercise_id}


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

import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app import plan_store
from app.agents.summarize import summarize_session
from app.agents.tools import record_injury, utcnow
from app.auth import get_current_user_id
from app.database import get_db
from app.entitlements import require_tier, resolve_tier

router = APIRouter(tags=["session"])
logger = logging.getLogger(__name__)


# ── Models ────────────────────────────────────────────────────────────────────

class SessionStart(BaseModel):
    plan_id: str | None = None  # if provided, snapshot is copied from workout_plans
    workout_id: str | None = None  # which day of the plan the user opened
    # Client-generated session id (UUID). Lets a workout START offline: the app
    # mints the id locally, logs sets against it, and this create replays from
    # the outbox whenever connectivity returns. Replays are idempotent — an id
    # we already own comes back unchanged instead of stomping newer sessions.
    id: UUID | None = None


class SessionPatch(BaseModel):
    current_exercise: str | None = None


class SessionNote(BaseModel):
    """Something the user says mid-workout, by tapping rather than talking.

    Two kinds, because they end up in different places: an `injury` becomes a row the
    safety layer filters plans on, a `comment` is only ever recalled semantically.
    """
    kind: Literal["injury", "comment"]
    text: str = ""
    body_part: str | None = None
    severity: Literal["mild", "moderate", "severe"] | None = None
    avoid_movements: list[str] = Field(default_factory=list)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _end_existing_active_sessions(
    user_id: str, db: AsyncClient, background: BackgroundTasks | None = None
) -> None:
    res = await db.table("workout_sessions").update(
        {"is_active": False, "updated_at": utcnow()}
    ).eq("user_id", user_id).eq("is_active", True).execute()
    # Sessions ended THIS way used to vanish without a summary — the summarize
    # only ran on the explicit DELETE. Rare when only voice users had sessions;
    # now every screen-open mints one, so "left via the chevron, opened another
    # day later" is a completely ordinary premium workout that deserves its
    # memory. summarize_session no-ops on sessions with no sets.
    if background is not None and res.data:
        if await resolve_tier(user_id, db) == "premium":
            for row in res.data:
                background.add_task(summarize_session, row["id"], user_id, db)


async def _build_plan_snapshot(
    plan_id: str, user_id: str, db: AsyncClient, tier: str
) -> dict:
    """Self-contained plan snapshot (plan_store owns the tree shape), so the
    session is unaffected if the user later edits the plan.

    The snapshot is taken WITH this session's target weights baked in, so the numbers
    the user sees can't shift mid-workout if they log something on another device."""
    tree = await plan_store.build_plan_tree(plan_id, user_id, db, tier)
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
    ).eq("is_active", True).order("updated_at", desc=True).limit(1).execute()
    if not res.data:
        return {"session": None}
    session = res.data[0]
    # Include the session's logged sets so a reopening client can restore its
    # checkmarks and position in one round trip (session resume).
    sets = await db.table("completed_sets").select(
        "exercise_name, set_index, reps, weight, weight_unit"
    ).eq("session_id", session["id"]).eq("user_id", user_id).order("logged_at").execute()
    session["completed_sets"] = sets.data or []
    return {"session": session}


@router.post("/session", status_code=201)
async def start_session(
    body: SessionStart,
    background: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    # Idempotent replay FIRST, before the deactivate below. An offline outbox
    # retries "create session X" until it lands; if X already exists, the user
    # may have since started (or even finished) session Y, and running the
    # blind deactivate again would end Y. An id that exists and is ours is
    # returned as-is; someone else's id gets the same 404 shape as everywhere
    # else (never a 409 — that would confirm the id exists, see session_store).
    if body.id is not None:
        existing = await db.table("workout_sessions").select("*").eq(
            "id", str(body.id)
        ).execute()
        if existing.data:
            row = existing.data[0]
            if row["user_id"] != user_id:
                raise HTTPException(status_code=404, detail="Session not found")
            return {"session": row}

    # Close any existing active session first (one active session per user).
    await _end_existing_active_sessions(user_id, db, background)

    # No explicit plan_id → fall back to the user's active plan, so the coach
    # always sees the real program even for clients that don't pass one.
    plan_id = body.plan_id or await plan_store.get_active_plan_id(user_id, db)
    plan_snapshot = None
    if plan_id:
        plan_snapshot = await _build_plan_snapshot(
            plan_id, user_id, db, await resolve_tier(user_id, db)
        )
        # Record which day is being trained — the coach's session context leads
        # with it instead of guessing the day from logged sets or the weekday.
        if body.workout_id and any(
            w.get("id") == body.workout_id for w in plan_snapshot.get("workouts", [])
        ):
            plan_snapshot["today_workout_id"] = body.workout_id

    row: dict = {
        "user_id": user_id,
        "is_active": True,
        "plan_snapshot": plan_snapshot,
        "chat_history": [],
    }
    # The id column is a plain UUID with no ordering assumptions, so the
    # client's UUID serves as the primary key directly — every read path
    # already guards ownership, so a client-minted id changes nothing there.
    if body.id is not None:
        row["id"] = str(body.id)
    res = await db.table("workout_sessions").insert(row).execute()

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


@router.post(
    "/session/{session_id}/note",
    status_code=201,
    dependencies=[Depends(require_tier("premium"))],
)
async def add_session_note(
    session_id: str,
    body: SessionNote,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    """Report an injury or leave a note mid-workout, without saying a word.

    Until now the only way to tell the coach something during a session was to talk to it.
    That fails exactly when it matters most — a crowded gym, a user who doesn't want to
    narrate their knee out loud, or voice simply not switched on.

    Premium-gated to match report_injury: this is the same capability, reached by tapping.
    """
    owned = (
        await db.table("workout_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not owned.data:
        raise HTTPException(status_code=404, detail="Session not found")

    text = (body.text or "").strip()

    if body.kind == "injury":
        if not body.body_part:
            raise HTTPException(status_code=400, detail="body_part is required for an injury")
        injury = await record_injury(
            user_id,
            db,
            body_part=body.body_part,
            severity=body.severity,
            notes=text or None,
            avoid_movements=body.avoid_movements or None,
            session_id=session_id,
        )
        return {"status": "injury_recorded", "injury": injury}

    if not text:
        raise HTTPException(status_code=400, detail="text is required for a comment")

    # A comment has no structured home — recalling it later is the whole point, which is
    # exactly what personal_chunks is for ('coaching_note' is already a valid kind).
    from app.rag import memory

    note_id = await memory.remember(
        user_id, "coaching_note", text, db, source_id=session_id
    )
    return {"status": "note_recorded", "note_id": note_id}


@router.delete("/session/{session_id}", status_code=200)
async def end_session(
    session_id: str,
    background: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    # The is_active filter makes this tell us whether WE ended it: rows come
    # back only when the session was still active. Ending is idempotent — the
    # offline outbox replays it — so "already ended" is a success, not a 404.
    res = await db.table("workout_sessions").update(
        {"is_active": False, "updated_at": utcnow()}
    ).eq("id", session_id).eq("user_id", user_id).eq("is_active", True).execute()

    if not res.data:
        existing = await db.table("workout_sessions").select("id").eq(
            "id", session_id
        ).eq("user_id", user_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Session not found")
        # Already ended (a replay) — succeed without re-queuing the summary
        # below: it costs a model call per replay for a memory the dedup layer
        # would discard anyway.
        return {"status": "ended", "session_id": session_id}

    # Premium's "Lifetime Personal Memory": distil the session into something the coach
    # can recall months from now. Backgrounded because it costs a model call — ending a
    # workout returns immediately either way, and a lost summary is not worth a slow tap.
    if await resolve_tier(user_id, db) == "premium":
        background.add_task(summarize_session, session_id, user_id, db)

    return {"status": "ended", "session_id": session_id}

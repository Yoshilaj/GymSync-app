"""
Agent orchestration.
_agent_events()  — core loop, yields plain dicts (shared by SSE and WebSocket)
run_chat_agent() — SSE wrapper for POST /api/chat
LangGraph state machine (Step 11) will wrap _agent_events with state routing.
"""
import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from anthropic import AsyncAnthropic
from supabase import AsyncClient

from app.agents import conversation_store
from app.agents.personalities import build_system_prompt
from app.agents.tools import (
    TOOL_DEFINITIONS,
    ToolContext,
    _names_match,
    _pick_today_workout,
    blocks_to_dicts,
    execute_tool,
    utcnow,
)
from app.config import settings

# Two-tier routing: every live turn starts on the fast model with the full tool set.
# The model itself calls escalate_to_reasoning to hand off to the reasoning model for
# safety (pain/injury), plan changes, or open-ended reasoning — no extra classifier hop.
MODEL_FAST = "claude-haiku-4-5-20251001"
MODEL_REASONING = "claude-sonnet-4-6"

logger = logging.getLogger(__name__)

_anthropic: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _anthropic
    if _anthropic is None:
        _anthropic = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _anthropic


async def _load_personality(user_id: str, db: AsyncClient) -> dict:
    res = await db.table("personalities").select("preset_id, system_prompt_override").eq(
        "user_id", user_id
    ).execute()
    if res.data:
        return res.data[0]
    return {"preset_id": "classic", "system_prompt_override": None}


async def _load_history(
    session_id: str | None,
    conversation_id: str | None,
    db: AsyncClient,
) -> list[dict]:
    if conversation_id:
        # Chat-tab thread: already bounded (count + char budget) by the store.
        return await conversation_store.load_recent(conversation_id, db)
    if not session_id:
        return []
    res = await db.table("workout_sessions").select("chat_history").eq(
        "id", session_id
    ).single().execute()
    return res.data.get("chat_history") or []


async def _load_profile_context(user_id: str, db: AsyncClient) -> str:
    """Compact <user_profile> block prefixed onto every turn (chat AND voice) —
    who the agent is coaching: goals, constraints, body stats, active injuries."""
    res, inj = await asyncio.gather(
        db.table("profiles").select(
            "units, experience, goals, preferences, sex, birth_year, height_cm, "
            "weight_kg, activity_level, training_days, session_minutes, equipment, onboarded_at"
        ).eq("user_id", user_id).execute(),
        db.table("injuries").select(
            "body_part, severity, avoid_movements"
        ).eq("user_id", user_id).eq("status", "active").execute(),
    )
    if not res.data:
        return ""
    p = res.data[0]

    lines = []
    for key in (
        "experience", "goals", "training_days", "session_minutes", "equipment",
        "sex", "birth_year", "height_cm", "weight_kg", "activity_level", "units",
    ):
        value = p.get(key)
        if value not in (None, [], ""):
            lines.append(f"{key}: {json.dumps(value) if isinstance(value, list) else value}")
    injuries_note = (p.get("preferences") or {}).get("injuries_note")
    if injuries_note:
        lines.append(f"injuries_note: {injuries_note}")
    if inj.data:
        lines.append(f"active_injuries: {json.dumps(inj.data)}")
    if not p.get("onboarded_at"):
        lines.append("onboarding: NOT complete — profile may be missing fields")
    if not lines:
        return ""
    return "<user_profile>\n" + "\n".join(lines) + "\n</user_profile>\n\n"


def _fmt_set(row: dict) -> str:
    weight = row.get("weight")
    if weight is None:
        return str(row.get("reps"))
    return f"{row.get('reps')}@{weight}{row.get('weight_unit') or ''}"


def _fmt_target(target_sets: list) -> str:
    """'3x8' / '3x8-12' from the snapshot's camelCase PlannedSet list."""
    n = len(target_sets or [])
    if not n:
        return "?"
    first = target_sets[0] or {}
    reps = first.get("targetReps")
    if reps is None:
        return f"{n} sets"
    high = first.get("repsHigh")
    return f"{n}x{reps}-{high}" if high else f"{n}x{reps}"


def _render_current_sets(target_sets: list, rows: list[dict]) -> list[str]:
    """Numbered per-set sub-lines for the CURRENT exercise, so spoken ordinals
    ("the first set") ground to a set_number the model can pass to log_set.
    Rows land by their set_index when sane; legacy/duplicate indexes fall back
    to the first free slot. Other exercises keep the aggregate line — this
    detail is only worth the tokens where the conversation actually is."""
    planned = len(target_sets or [])
    by_slot: dict[int, dict] = {}
    seq = 0
    for row in rows:
        idx = row.get("set_index")
        if not isinstance(idx, int) or idx < 0 or idx in by_slot:
            idx = seq
            while idx in by_slot:
                idx += 1
        by_slot[idx] = row
        seq = idx + 1
    total = max(planned, (max(by_slot) + 1) if by_slot else 0)
    out: list[str] = []
    for slot in range(total):
        row = by_slot.get(slot)
        if row:
            out.append(f"   set {slot + 1}: {_fmt_set(row)} — done")
            continue
        target = (target_sets[slot] or {}) if slot < planned else {}
        reps = target.get("targetReps")
        high = target.get("repsHigh")
        tgt = f"target {reps}-{high}" if reps and high else (f"target {reps}" if reps else "no target")
        out.append(f"   set {slot + 1}: not done ({tgt})")
    return out


def _render_session_state(
    current_exercise: str | None,
    overrides: dict,
    snapshot: dict | None,
    sets: list[dict],
) -> str:
    # Group logged sets per exercise, preserving log order.
    logged: dict[str, list[dict]] = {}
    for row in sets:
        logged.setdefault(row.get("exercise_name") or "?", []).append(row)

    lines: list[str] = []
    today = _pick_today_workout(snapshot, current_exercise, list(logged)) if snapshot else None

    if today:
        title = today.get("title") or "Workout"
        day = today.get("day_label")
        lines.append(f"today_workout: {title}" + (f" ({day})" if day else ""))

        exercises = today.get("exercises") or []
        matched: set[str] = set()

        def _sets_for(plan_name: str | None) -> list[dict]:
            for name, rows in logged.items():
                if name not in matched and _names_match(name, plan_name):
                    matched.add(name)
                    return rows
            return []

        per_exercise = [(e, _sets_for(e.get("exercise_name"))) for e in exercises]

        # CURRENT = the client-reported exercise if it's in today's list, else the
        # first exercise that still has sets left, else the first exercise.
        current_idx = next(
            (i for i, (e, _) in enumerate(per_exercise)
             if _names_match(current_exercise, e.get("exercise_name"))),
            None,
        )
        if current_idx is None:
            current_idx = next(
                (i for i, (e, rows) in enumerate(per_exercise)
                 if len(rows) < len(e.get("target_sets") or []) or not e.get("target_sets")),
                0 if per_exercise else None,
            )

        lines.append("exercises (in order):")
        for i, (e, rows) in enumerate(per_exercise):
            name = e.get("exercise_name") or "Exercise"
            planned = len(e.get("target_sets") or [])
            done = ", ".join(_fmt_set(r) for r in rows)
            if rows and planned and len(rows) >= planned:
                status = f"DONE ({done})"
            elif rows:
                status = f"IN PROGRESS {len(rows)}/{planned or '?'} ({done})"
            else:
                status = "not started"
            marker = "   <- CURRENT" if i == current_idx else ""
            lines.append(f"{i + 1}. {name} — {_fmt_target(e.get('target_sets'))} — {status}{marker}")
            if i == current_idx:
                lines.extend(_render_current_sets(e.get("target_sets") or [], rows))

        for name, rows in logged.items():
            if name not in matched:
                lines.append(f"extra: {name} — {', '.join(_fmt_set(r) for r in rows)}")

        resolved_current = current_exercise
        if not resolved_current and current_idx is not None and per_exercise:
            resolved_current = per_exercise[current_idx][0].get("exercise_name")
        lines.append(f"current_exercise: {resolved_current or 'none'}")
    else:
        # No day resolved (freeform session, or no plan): fall back to the plan's
        # day list plus the grouped log — the model can still call get_workout_plan.
        if snapshot and snapshot.get("workouts"):
            days = ", ".join(
                f"{w.get('title') or 'Workout'} ({w.get('day_label')})" if w.get("day_label")
                else (w.get("title") or "Workout")
                for w in snapshot["workouts"]
            )
            lines.append(f"plan_days: {days}")
        lines.append(f"current_exercise: {current_exercise or 'none'}")
        for name, rows in logged.items():
            lines.append(f"logged: {name} — {', '.join(_fmt_set(r) for r in rows)}")

    if overrides:
        lines.append(f"overrides: {json.dumps(overrides)}")
    lines.append(
        "If the user mentions a set/reps/weight WITHOUT naming an exercise, "
        "it is for the CURRENT exercise — log it ONLY if they say it's done "
        "(never log stated plans for an upcoming set)."
    )
    lines.append(
        "Sets are numbered 1-based; when the user names one ('the first set', "
        "'set 3'), pass set_number to log_set."
    )
    return "<session_state>\n" + "\n".join(lines) + "\n</session_state>\n\n"


async def _load_session_context(session_id: str | None, db: AsyncClient) -> str:
    """Compact <session_state> block for live-workout turns: today's exercises in
    order with every set logged so far, the CURRENT position, and any overrides.
    Best-effort by contract — session context is an enhancement and must never
    kill a turn (a stale session_id used to raise out of `.single()` here)."""
    if not session_id:
        return ""
    try:
        res, sets_res = await asyncio.gather(
            db.table("workout_sessions").select(
                "current_exercise, session_overrides, plan_snapshot"
            ).eq("id", session_id).maybe_single().execute(),
            db.table("completed_sets").select(
                "exercise_name, set_index, reps, weight, weight_unit"
            ).eq("session_id", session_id).order("logged_at").limit(40).execute(),
        )
        if res is None or not res.data:
            return ""
        s = res.data
        return _render_session_state(
            s.get("current_exercise"),
            s.get("session_overrides") or {},
            s.get("plan_snapshot"),
            sets_res.data or [],
        )
    except Exception:
        logger.exception("session context unavailable for session %s", session_id)
        return ""


def _summarize_tool(name: str, args: dict, result: dict) -> str | None:
    """One compact clause for the cross-turn [actions: ...] note — the saved
    history keeps only user/assistant text, so without this the model forgets
    what it DID last turn (e.g. re-logs a set it already logged). None = not
    worth remembering (pure reads)."""
    if not isinstance(result, dict):
        return None
    if result.get("error"):
        return f"{name} failed"
    if name == "log_set":
        n = result.get("set_number") or (result.get("set_index", 0) + 1)
        verb = "corrected" if result.get("status") == "set_corrected" else "logged"
        detail = str(args.get("reps", "?"))
        if args.get("weight") is not None:
            detail += f"@{args['weight']}{args.get('weight_unit') or ''}"
        return f"{verb} {args.get('exercise_name')} set {n}: {detail}"
    if name == "start_timer":
        return f"started {result.get('duration_seconds', 90)}s rest timer"
    if name in ("stop_timer", "pause_timer"):
        return name.replace("_", " ")
    if name == "go_to_exercise":
        return f"moved to {args.get('exercise_name') or 'next exercise'}"
    if name == "swap_exercise":
        return f"swapped {args.get('from_exercise')} for {args.get('to_exercise') or 'an alternative'}"
    if name == "modify_plan":
        return "adjusted today's session plan"
    if name == "add_exercise_to_session":
        return f"added {args.get('exercise_name')} to today"
    if name == "report_injury":
        return f"recorded injury: {args.get('body_part')}"
    if name == "propose_workout_plan":
        return "proposed a weekly plan (awaiting Accept)"
    return None


async def _save_history(
    session_id: str | None,
    existing: list[dict],
    user_message: str,
    assistant_text: str,
    db: AsyncClient,
    conversation_id: str | None = None,
    user_id: str | None = None,
    tool_notes: list[str] | None = None,
) -> None:
    if conversation_id and user_id:
        await conversation_store.add_messages(
            conversation_id,
            user_id,
            [
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": assistant_text},
            ],
            db,
        )
        return
    if not session_id:
        return
    assistant_entry: dict = {
        "role": "assistant", "content": assistant_text, "ts": utcnow(),
    }
    # What the tools DID this turn, replayed as an [actions: ...] suffix so the
    # next turn's model remembers its own actions (session JSONB path only).
    if tool_notes:
        assistant_entry["tool_notes"] = tool_notes[:6]
    updated = existing + [
        {"role": "user", "content": user_message, "ts": utcnow()},
        assistant_entry,
    ]
    await db.table("workout_sessions").update(
        {"chat_history": updated[-20:], "updated_at": utcnow()}
    ).eq("id", session_id).execute()


async def _agent_events(
    user_message: str,
    session_id: str | None,
    user_id: str,
    db: AsyncClient,
    conversation_id: str | None = None,
    model: str | None = None,
    anonymous_profile: dict | None = None,
    personality_preset: str | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Core agent loop. Yields plain event dicts:
      {"type": "text_delta", "text": "..."}
      {"type": "app_action", "action": "...", ...}
      {"type": "done"}
      {"type": "error", "message": "..."}
    """
    client = _get_client()
    ctx = ToolContext(
        user_id=user_id,
        session_id=session_id,
        db=db,
        anonymous_profile=anonymous_profile,
    )

    if anonymous_profile is not None:
        # No user rows exist (user_id isn't even a valid uuid here) — the
        # request payload is the whole context, and the quiz preset rides in.
        personality = {
            "preset_id": personality_preset or "classic",
            "system_prompt_override": None,
        }
        history, session_ctx, profile_ctx = [], "", ""
    else:
        # Independent reads — run concurrently; on a voice turn this is the
        # bulk of the pre-model latency.
        personality, history, session_ctx, profile_ctx = await asyncio.gather(
            _load_personality(user_id, db),
            _load_history(session_id, conversation_id, db),
            _load_session_context(session_id, db),
            _load_profile_context(user_id, db),
        )
        if personality_preset:
            personality = {"preset_id": personality_preset, "system_prompt_override": None}

    system_text = build_system_prompt(
        personality["preset_id"], personality.get("system_prompt_override")
    )
    # Cached block: personality + rules + tool defs.
    # Changes only when the user switches personality — covers ~80% of tokens.
    system = [{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}]

    # Conversation history arrives pre-bounded from the store; the workout-session
    # JSONB path keeps its original last-10 replay window. Saved tool_notes ride
    # back in as an [actions: ...] suffix (the prompt marks these as internal).
    replay = history if conversation_id else history[-10:]
    messages: list[dict] = []
    for m in replay:
        content = m["content"]
        if m.get("tool_notes"):
            content = f"{content}\n[actions: {'; '.join(m['tool_notes'])}]".strip()
        messages.append({"role": m["role"], "content": content})
    full_user_message = profile_ctx + session_ctx + user_message
    messages.append({"role": "user", "content": full_user_message})

    assistant_text_parts: list[str] = []
    tool_notes: list[str] = []
    model = model or MODEL_FAST  # escalate_to_reasoning bumps this to MODEL_REASONING

    try:
        while True:
            async with client.messages.stream(
                model=model,
                system=system,
                messages=messages,
                tools=TOOL_DEFINITIONS,
                # 4096: a full propose_workout_plan tool call alone exceeds 1024
                # tokens and would truncate mid-tool_use (stop_reason max_tokens).
                max_tokens=4096,
            ) as stream:
                async for chunk in stream.text_stream:
                    assistant_text_parts.append(chunk)
                    yield {"type": "text_delta", "text": chunk}
                final = await stream.get_final_message()

            if final.stop_reason != "tool_use":
                await _save_history(
                    session_id,
                    history,
                    user_message,
                    "".join(assistant_text_parts),
                    db,
                    conversation_id=conversation_id,
                    user_id=user_id,
                    tool_notes=tool_notes,
                )
                yield {"type": "done"}
                break

            tool_results: list[dict] = []
            for block in final.content:
                if block.type == "tool_use":
                    if block.name == "escalate_to_reasoning":
                        # Internal routing: re-run the same messages on the reasoning model.
                        model = MODEL_REASONING
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps({"status": "escalated"}),
                        })
                        continue
                    result, app_actions = await execute_tool(block.name, block.input, ctx)
                    note = _summarize_tool(block.name, block.input, result)
                    if note:
                        tool_notes.append(note)
                    for action in app_actions:
                        yield action
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })

            messages = messages + [
                {"role": "assistant", "content": blocks_to_dicts(final.content)},
                {"role": "user", "content": tool_results},
            ]

    except Exception as exc:
        # Mid-stream failure: by the time this fires, earlier deltas may already be
        # spoken/rendered. Non-fatal + a trailing done keeps the client's turn state
        # machine intact (it returns to listening instead of hanging in thinking).
        logger.exception("agent turn failed")
        yield {"type": "error", "message": str(exc), "fatal": False}
        yield {"type": "done"}


async def run_chat_agent(
    user_message: str,
    session_id: str | None,
    user_id: str,
    db: AsyncClient,
) -> AsyncGenerator[str, None]:
    """SSE wrapper around _agent_events for POST /api/chat."""
    async for event in _agent_events(user_message, session_id, user_id, db):
        yield f"data: {json.dumps(event)}\n\n"


# ── One-shot plan generation (onboarding) ─────────────────────────────────────

class PlanGenerationError(Exception):
    """The agent didn't produce a plan proposal."""


GENERATION_MESSAGE = (
    "Create my first weekly workout plan now, based only on my profile. "
    "Call list_exercises to review the catalog, then call propose_workout_plan. "
    "Do not ask questions and do not add commentary — produce the plan."
)


async def _drive_plan_generation(
    message: str,
    user_id: str,
    db: AsyncClient,
    *,
    anonymous_profile: dict | None = None,
    personality_preset: str | None = None,
) -> dict:
    """Shared driver: run the agent loop on the reasoning model, swallow text,
    return the plan_proposal packet. One internal retry."""
    last_error: str | None = None
    for _attempt in range(2):
        gen = _agent_events(
            message,
            session_id=None,
            user_id=user_id,
            db=db,
            model=MODEL_REASONING,
            anonymous_profile=anonymous_profile,
            personality_preset=personality_preset,
        )
        try:
            async with asyncio.timeout(90):
                async for event in gen:
                    if event["type"] == "plan_proposal":
                        return event
                    if event["type"] == "error":
                        last_error = event["message"]
                        break
                    # text_delta / app_action swallowed; a bare "done" without
                    # a proposal falls through to the retry.
        except TimeoutError:
            last_error = "Plan generation timed out."
        finally:
            # Stop the loop — the captured packet is all we need; this skips
            # the model's post-tool follow-up turn entirely.
            await gen.aclose()
    raise PlanGenerationError(last_error or "The coach didn't produce a plan.")


async def run_plan_generation(user_id: str, db: AsyncClient) -> dict:
    """
    Chat-free plan generation for onboarding. Drives the normal agent loop on
    the reasoning model, swallows text, and returns the plan_proposal packet
    (the tool has already persisted the plan_proposals row by then). No
    session/conversation ids → zero chat side effects. One internal retry.
    """
    return await _drive_plan_generation(GENERATION_MESSAGE, user_id, db)


# Same key order _load_profile_context uses, so the model sees an identical
# profile block whether the facts came from a row or a request payload.
_ANON_PROFILE_KEYS = (
    "experience", "goals", "training_days", "session_minutes", "equipment",
    "sex", "birth_year", "height_cm", "weight_kg", "activity_level", "units",
)

_VALID_PRESETS = {"classic", "supportive", "energetic"}


def _anonymous_profile_block(profile: dict) -> str:
    lines = []
    for key in _ANON_PROFILE_KEYS:
        value = profile.get(key)
        if value not in (None, [], ""):
            lines.append(f"{key}: {json.dumps(value) if isinstance(value, list) else value}")
    if profile.get("injuries_note"):
        lines.append(f"injuries_note: {profile['injuries_note']}")
    if profile.get("injury_areas"):
        lines.append(f"injury_areas: {json.dumps(profile['injury_areas'])}")
    if not lines:
        return ""
    return "<user_profile>\n" + "\n".join(lines) + "\n</user_profile>\n\n"


async def run_anonymous_plan_generation(
    profile: dict, db: AsyncClient, personality_preset: str | None = None
) -> dict:
    """
    Pre-signup generation: no user rows exist, so the answers ride in as the
    profile block and the proposal tool runs without persisting (proposal_id
    is None). The client stashes the returned plan and adopts it post-signup.
    """
    preset = personality_preset if personality_preset in _VALID_PRESETS else None
    message = _anonymous_profile_block(profile) + GENERATION_MESSAGE
    return await _drive_plan_generation(
        message, "", db, anonymous_profile=profile, personality_preset=preset
    )

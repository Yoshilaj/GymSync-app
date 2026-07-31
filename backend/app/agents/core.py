"""
Agent orchestration.
_agent_events()  — core loop, yields plain dicts (shared by SSE and WebSocket)
run_chat_agent() — SSE wrapper for POST /api/chat
LangGraph state machine (Step 11) will wrap _agent_events with state routing.
"""
import asyncio
import json
import logging
import time
from collections import defaultdict
from collections.abc import AsyncGenerator
from datetime import date, datetime, timedelta, timezone

from anthropic import AsyncAnthropic
from supabase import AsyncClient

from app.agents import conversation_store
from app.agents.personalities import DEFAULT_PRESET, build_system_prompt
from app.agents.tools import (
    TOOL_DEFINITIONS,
    ToolContext,
    _names_match,
    _pick_today_workout,
    blocks_to_dicts,
    execute_tool,
    tools_for_tier,
    utcnow,
)
from app.config import settings
from app.rag import personal

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
    return {"preset_id": DEFAULT_PRESET, "system_prompt_override": None}


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
    prefs = p.get("preferences") or {}
    # Where they train ('gym' | 'home' | 'bodyweight'). Onboarding collects it
    # but it lives only in the JSONB blob, so it has to be lifted out by hand —
    # without it the model sees an equipment list with no context for why it is
    # short, and programs a gym session for someone stood in their bedroom.
    training_place = prefs.get("training_place")
    if training_place:
        lines.append(f"training_place: {training_place}")
    injuries_note = prefs.get("injuries_note")
    if injuries_note:
        lines.append(f"injuries_note: {injuries_note}")
    if inj.data:
        lines.append(f"active_injuries: {json.dumps(inj.data)}")
    if not p.get("onboarded_at"):
        lines.append("onboarding: NOT complete — profile may be missing fields")
    if not lines:
        return ""
    return "<user_profile>\n" + "\n".join(lines) + "\n</user_profile>\n\n"


# ── Recent training history ───────────────────────────────────────────────────
# The coach is told to cite real numbers unprompted and to volunteer at most one
# observation the user didn't ask for. Both need data that used to live only
# behind /progress, so a compact digest rides in on every turn.

_HISTORY_TTL_SECONDS = 60.0
_HISTORY_SESSIONS = 4      # distinct training days rendered
_HISTORY_EXERCISES = 5     # exercises in the bests list
_STALL_SESSIONS = 3        # equal top weights across this many days = stalled
# How long personal-memory recall may hold up a turn before the coach speaks
# without it. Sized against the ~1s voice TTFT budget: recall is a bonus, and a
# turn that never arrives is worse than one that forgot something.
_PERSONAL_MEMORY_BUDGET_S = 2.0
# "user_id:tier" -> (monotonic deadline, rendered block). Tier is in the key because the
# rendered block differs by tier — see _load_recent_history.
_history_cache: dict[str, tuple[float, str]] = {}


def _epley(weight: float, reps: int) -> float:
    """Estimated 1RM — ranks "best set" so 100x1 beats 60x10."""
    return weight * (1 + reps / 30)


def _render_recent_history(rows: list[dict], tier: str = "premium") -> str:
    """<recent_history> from newest-first completed_sets rows.

    Four parts, each capped so the block stays ~20 lines: how long they've kept
    it up, what the last few sessions were, their best set per lift, and which
    lifts have not moved. `stalled` is the one the model can actually act on —
    a computed signal rather than something it has to infer from a set list.

    `stalled` is Premium-only, and that is where the line between the tiers falls:
    showing someone their own numbers is Free (the Progress tab already does it),
    while analysing them and saying what to do next is "Data-Driven Progression
    Management". Streak, sessions and bests stay on every tier — they were there
    before this split existed and taking them away would be a downgrade.
    """
    if not rows:
        return ""

    by_day: dict[date, list[dict]] = defaultdict(list)
    for r in rows:
        try:
            by_day[datetime.fromisoformat(r["logged_at"]).date()].append(r)
        except (TypeError, ValueError):
            continue
    if not by_day:
        return ""

    days = sorted(by_day, reverse=True)
    out: list[str] = []

    # Streak: consecutive training days ending today or yesterday.
    trained = set(days)
    today = date.today()
    cursor = today if today in trained else today - timedelta(days=1)
    streak = 0
    while cursor in trained:
        streak += 1
        cursor -= timedelta(days=1)
    if streak:
        out.append(f"streak: {streak} day{'s' if streak != 1 else ''}")

    # Last few sessions, one line each.
    session_lines: list[str] = []
    for day in days[:_HISTORY_SESSIONS]:
        per_ex: dict[str, list[dict]] = defaultdict(list)
        for r in by_day[day]:
            per_ex[r["exercise_name"]].append(r)
        parts = []
        for name, sets in list(per_ex.items())[:4]:
            top = max((s.get("weight") or 0) for s in sets)
            reps = sets[0].get("reps")
            parts.append(
                f"{name} {len(sets)}x{reps}@{top:g}" if top else f"{name} {len(sets)}x{reps}"
            )
        session_lines.append(f"- {day:%m-%d} — {', '.join(parts)}")
    if session_lines:
        out.append("last_sessions:")
        out.extend(session_lines)

    # Best set per exercise, ordered by how recently the lift was trained.
    order: list[str] = []
    units: dict[str, str] = {}
    for r in rows:
        name = r["exercise_name"]
        if name not in order:
            order.append(name)
        units.setdefault(name, r.get("weight_unit") or "")
    best: dict[str, dict] = {}
    for r in rows:
        weight, reps = r.get("weight"), r.get("reps")
        if not weight or not reps:
            continue
        name = r["exercise_name"]
        if name not in best or _epley(float(weight), reps) > _epley(
            float(best[name]["weight"]), best[name]["reps"]
        ):
            best[name] = r
    best_lines = []
    for name in order[:_HISTORY_EXERCISES]:
        r = best.get(name)
        if not r:
            continue
        unit = r.get("weight_unit") or ""
        best_lines.append(
            f"- {name}: {float(r['weight']):g}{unit} x{r['reps']} ({r['logged_at'][5:10]})"
        )
    if best_lines:
        out.append("bests:")
        out.extend(best_lines)

    # Stalled: top weight unchanged across the last N days the lift was trained.
    stall_lines = []
    for name in order[:_HISTORY_EXERCISES] if tier == "premium" else []:
        tops: list[float] = []
        for day in days:
            weights = [
                float(s["weight"])
                for s in by_day[day]
                if s["exercise_name"] == name and s.get("weight")
            ]
            if weights:
                tops.append(max(weights))
            if len(tops) == _STALL_SESSIONS:
                break
        if len(tops) == _STALL_SESSIONS and len(set(tops)) == 1:
            stall_lines.append(
                f"- {name}: {tops[0]:g}{units.get(name, '')}, "
                f"unchanged {_STALL_SESSIONS} sessions"
            )
    if stall_lines:
        out.append("stalled:")
        out.extend(stall_lines)

    if not out:
        return ""
    return "<recent_history>\n" + "\n".join(out) + "\n</recent_history>\n\n"


async def _load_recent_history(user_id: str, db: AsyncClient, tier: str = "premium") -> str:
    """Cached <recent_history> block. Best-effort: never blocks a turn.

    Cached for a minute because voice turns hit this path too and it is the only
    new DB read inside the speech-to-first-audio budget. A set logged mid-session
    already appears in <session_state>, so a slightly stale digest costs the
    model nothing it doesn't have elsewhere.

    The cache key carries the tier: the rendered block differs between tiers, and a
    shared key would serve one user's Premium digest to a free account on the next hit.
    """
    key = f"{user_id}:{tier}"
    cached = _history_cache.get(key)
    now = time.monotonic()
    if cached and cached[0] > now:
        return cached[1]
    try:
        res = (
            await db.table("completed_sets")
            .select("exercise_name, reps, weight, weight_unit, logged_at")
            .eq("user_id", user_id)
            .order("logged_at", desc=True)
            .limit(400)
            .execute()
        )
        block = _render_recent_history(res.data or [], tier)
    except Exception:
        logger.warning("recent history load failed", exc_info=True)
        return ""
    _history_cache[key] = (now + _HISTORY_TTL_SECONDS, block)
    return block


async def _load_personal_memory(
    user_id: str, query: str, db: AsyncClient, channel: str, tier: str
) -> str:
    """Premium's "Lifetime Personal Memory" — semantic recall over what the user has told
    the coach before, written by rag/memory.remember.

    The tier gate lives here rather than inside prefetch so the retrieval module stays
    policy-free. Best-effort by construction: prefetch swallows its own failures and
    returns "", so a cold embedder or a missing RPC costs the turn nothing.
    """
    if tier != "premium":
        return ""
    # Hard deadline. prefetch() swallows its own *errors*, but its failure mode
    # on a cold process is being SLOW, not raising: the first call lazily loads
    # the ONNX embedding model (downloading ~500MB if the cache is cold), and it
    # sits inside the gather that has to finish before the coach can say
    # anything. Every other context load here is bounded; this one wasn't.
    try:
        async with asyncio.timeout(_PERSONAL_MEMORY_BUDGET_S):
            return await personal.prefetch(user_id, query, db, channel)
    except TimeoutError:
        logger.warning("personal memory prefetch exceeded its budget; skipping")
        return ""


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


async def _resolve_tier(
    user_id: str, db: AsyncClient | None, anonymous_profile: dict | None
) -> str:
    """
    The caller's subscription tier, for the tool filter and the prompt.

    Fails CLOSED. If the tier can't be read — no database handle, a transient
    read failure — the answer is "free". The cost of that is a paying customer
    briefly losing the Premium tools during an outage; the cost of failing open
    is handing those tools to everyone whenever the database hiccups. Only one
    of those is a security bug.

    Pre-signup generation has no account to read, and its toolset is already
    restricted to the two read-only generation tools.
    """
    if anonymous_profile is not None or db is None:
        return "free"

    from app.billing import store as billing_store

    try:
        return await billing_store.tier_for_user(user_id, db)
    except Exception:
        logger.warning("tier lookup failed for %s; treating as free", user_id, exc_info=True)
        return "free"


async def _agent_events(
    user_message: str,
    session_id: str | None,
    user_id: str,
    db: AsyncClient,
    conversation_id: str | None = None,
    model: str | None = None,
    anonymous_profile: dict | None = None,
    personality_preset: str | None = None,
    channel: str = "text",
) -> AsyncGenerator[dict, None]:
    """
    Core agent loop. Yields plain event dicts:
      {"type": "text_delta", "text": "..."}
      {"type": "app_action", "action": "...", ...}
      {"type": "done"}
      {"type": "error", "message": "..."}
    """
    client = _get_client()

    tier = await _resolve_tier(user_id, db, anonymous_profile)

    ctx = ToolContext(
        user_id=user_id,
        session_id=session_id,
        db=db,
        anonymous_profile=anonymous_profile,
        tier=tier,
    )

    if anonymous_profile is not None:
        # No user rows exist (user_id isn't even a valid uuid here) — the
        # request payload is the whole context, and the quiz preset rides in.
        personality = {
            "preset_id": personality_preset or DEFAULT_PRESET,
            "system_prompt_override": None,
        }
        history, session_ctx, profile_ctx, history_ctx, personal_ctx = [], "", "", "", ""
    else:
        # Independent reads — run concurrently; on a voice turn this is the
        # bulk of the pre-model latency.
        (
            personality, history, session_ctx, profile_ctx, history_ctx, personal_ctx
        ) = await asyncio.gather(
            _load_personality(user_id, db),
            _load_history(session_id, conversation_id, db),
            _load_session_context(session_id, db),
            _load_profile_context(user_id, db),
            _load_recent_history(user_id, db, tier),
            _load_personal_memory(user_id, user_message, db, channel, tier),
        )
        if personality_preset:
            personality = {"preset_id": personality_preset, "system_prompt_override": None}

    # The prompt must describe the SAME toolset the model is handed. It names
    # search_knowledge and report_injury in its rules, so leaving it untouched
    # while filtering the tools would have the model try to call a tool it
    # doesn't have and stall the turn.
    system_text = build_system_prompt(
        personality["preset_id"], personality.get("system_prompt_override"), tier=tier
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
    # Context blocks ride in the USER turn, below the system cache breakpoint —
    # they change as sets are logged and would invalidate the cache every turn
    # if they sat in the system block. Ordered oldest-context-first: who they are,
    # what they've been lifting, what they've told us, then what's happening right
    # now — <session_state> stays nearest the message because it moves fastest.
    full_user_message = profile_ctx + history_ctx + personal_ctx + session_ctx + user_message
    messages.append({"role": "user", "content": full_user_message})

    assistant_text_parts: list[str] = []
    tool_notes: list[str] = []
    model = model or MODEL_FAST  # escalate_to_reasoning bumps this to MODEL_REASONING
    # Text before and after a tool call arrives as two separate blocks with no
    # separator between them, so they used to fuse: "...pull up your plan."
    # + "You're on Upper A" rendered as "your plan.You're on Upper A". Open a
    # paragraph instead — it reads as two thoughts, and it restores the sentence
    # boundary the voice path's splitter needs to segment there.
    pending_break = False

    try:
        while True:
            async with client.messages.stream(
                model=model,
                system=system,
                messages=messages,
                tools=tools_for_tier(tier),
                # 4096: a full propose_workout_plan tool call alone exceeds 1024
                # tokens and would truncate mid-tool_use (stop_reason max_tokens).
                max_tokens=4096,
            ) as stream:
                async for chunk in stream.text_stream:
                    if pending_break:
                        # Hold the break until real text shows up, so a
                        # tool-only round never leaves a dangling blank line.
                        if not chunk.strip():
                            continue
                        pending_break = False
                        chunk = chunk.lstrip()
                        assistant_text_parts.append("\n\n")
                        yield {"type": "text_delta", "text": "\n\n"}
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
            # Anything this round already said needs separating from whatever
            # the next round says.
            pending_break = bool(assistant_text_parts)

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
    "training_place",
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

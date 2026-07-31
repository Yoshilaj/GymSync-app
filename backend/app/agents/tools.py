import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from supabase import AsyncClient


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


# Movement patterns the exercise catalog is tagged with (drives swap_exercise).
MOVEMENTS = ["push", "pull", "hinge", "squat", "lunge", "carry", "core", "isolation"]


# ── Tool schema definitions (passed to Claude) ────────────────────────────────

TOOL_DEFINITIONS = [
    {
        "name": "start_timer",
        "description": (
            "Start a rest timer on the user's screen. ONLY when the user explicitly "
            "asks for a timer or a custom duration ('give me 2 minutes'). NEVER call "
            "this after log_set — the app auto-starts a 90s rest on every logged set."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "duration_seconds": {
                    "type": "integer",
                    "description": "Timer duration in seconds. Default 90.",
                    "default": 90,
                }
            },
        },
    },
    {
        "name": "pause_timer",
        "description": "Pause the currently running rest timer.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "stop_timer",
        "description": "Stop and reset the rest timer.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "log_set",
        "description": (
            "Record a set the user has ALREADY COMPLETED (past tense — 'I did 5 at "
            "60'). Appends the next set by default; pass set_number when the user "
            "names a specific set, which OVERWRITES it if already logged (that is "
            "how corrections work). Never call this for stated intentions about a "
            "future set."
        ),
        "input_schema": {
            "type": "object",
            "required": ["exercise_name", "reps"],
            "properties": {
                "exercise_name": {"type": "string"},
                "reps": {"type": "integer"},
                "weight": {"type": "number"},
                "weight_unit": {
                    "type": "string",
                    "enum": ["kg", "lbs"],
                    "description": "Only when the user says it — omitted, the user's profile unit applies.",
                },
                "set_number": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "1-based set position when the user names one ('first set' = 1, 'set 3' = 3). Omit when they just finished their next set.",
                },
            },
        },
    },
    {
        "name": "add_exercise_to_session",
        "description": (
            "Queue an exercise into today's session that isn't in the plan "
            "(e.g. the user wants to add some curls). Use log_set once they finish a set."
        ),
        "input_schema": {
            "type": "object",
            "required": ["exercise_name"],
            "properties": {"exercise_name": {"type": "string"}},
        },
    },
    {
        "name": "add_exercise",
        "description": (
            "Create a new reusable exercise in the user's catalog when it does not exist yet "
            "(neither in the shared catalog nor the user's own). Use this before swapping to an "
            "exercise the catalog doesn't have."
        ),
        "input_schema": {
            "type": "object",
            "required": ["name", "muscle_group", "equipment"],
            "properties": {
                "name": {"type": "string"},
                "muscle_group": {"type": "string"},
                "equipment": {"type": "string"},
                "movement": {
                    "type": "string",
                    "enum": MOVEMENTS,
                    "description": "Primary movement pattern, used to find alternatives.",
                },
                "description": {"type": "string"},
            },
        },
    },
    {
        "name": "delete_exercise",
        "description": (
            "Soft-delete one of the user's OWN custom exercises (hides it from the catalog). "
            "Shared catalog exercises cannot be deleted. Past logged sets are preserved."
        ),
        "input_schema": {
            "type": "object",
            "required": ["exercise_id"],
            "properties": {"exercise_id": {"type": "string"}},
        },
    },
    {
        "name": "get_current_session_state",
        "description": "Read what exercises and sets are logged so far in the current session.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_workout_plan",
        "description": "Read the user's current training plan for this session.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "report_injury",
        "description": (
            "Record an injury or pain the user reports, so it informs future plans and the "
            "safety layer. Use whenever the user mentions pain, soreness, a tweak, or an injury."
        ),
        "input_schema": {
            "type": "object",
            "required": ["body_part"],
            "properties": {
                "body_part": {"type": "string"},
                "severity": {"type": "string", "enum": ["mild", "moderate", "severe"]},
                "notes": {"type": "string", "description": "Briefly, what the user said."},
                "avoid_movements": {
                    "type": "array",
                    "items": {"type": "string", "enum": MOVEMENTS},
                    "description": "Movement patterns to avoid while recovering.",
                },
            },
        },
    },
    {
        "name": "get_exercise_history",
        "description": (
            "Look up everything logged for ONE exercise: recent sessions, best set, "
            "estimated 1RM trend, whether it has stalled, and the recommended next "
            "target. Use when the user asks about their progress on a specific lift, "
            "when deciding what they should be lifting today, or when <recent_history> "
            "doesn't go back far enough — it only carries the last few sessions."
        ),
        "input_schema": {
            "type": "object",
            "required": ["exercise_name"],
            "properties": {
                "exercise_name": {
                    "type": "string",
                    "description": "Exactly as it appears in the plan or the catalog.",
                },
            },
        },
    },
    {
        "name": "remember_about_user",
        "description": (
            "Store something durable the user told you about themselves, so it is still known "
            "months from now. Use for lasting facts: equipment they do or don't have, a "
            "schedule constraint, a movement they love or refuse to do, a coaching style that "
            "works for them, a goal behind the goal. "
            "Do NOT use for: anything already in their profile, numbers you can look up "
            "(sets, reps, weights, PRs), one-off remarks about today, or injuries — injuries "
            "go to report_injury."
        ),
        "input_schema": {
            "type": "object",
            "required": ["fact"],
            "properties": {
                "fact": {
                    "type": "string",
                    "description": (
                        "One self-contained sentence in the third person, meaningful on its own "
                        "with no conversation around it. "
                        "Good: 'Trains fasted before 6am and dislikes long sessions.' "
                        "Bad: 'He said he prefers that.'"
                    ),
                },
                "kind": {
                    "type": "string",
                    "enum": ["preference", "coaching_note"],
                    "description": (
                        "'preference' = what the user wants or won't do. "
                        "'coaching_note' = what you learned about coaching them well."
                    ),
                },
            },
        },
    },
    {
        "name": "swap_exercise",
        "description": (
            "Swap one exercise for an alternative in today's session. If to_exercise is omitted, "
            "an alternative hitting the same muscle group is chosen automatically. If the swap is "
            "due to pain, also call report_injury."
        ),
        "input_schema": {
            "type": "object",
            "required": ["from_exercise"],
            "properties": {
                "from_exercise": {"type": "string"},
                "to_exercise": {
                    "type": "string",
                    "description": "Optional explicit replacement. Must exist in the catalog "
                    "(use add_exercise first if it doesn't).",
                },
                "reason": {"type": "string"},
            },
        },
    },
    {
        "name": "modify_plan",
        "description": (
            "Change TODAY'S session only — the saved weekly plan is never touched. "
            "Use op 'adjust' with sets and/or reps when the user wants a different "
            "volume today (e.g. \"I'll only do 3 sets of these\" → op 'adjust', "
            "exercise_name, sets 3). Use 'remove' to drop an exercise from today, "
            "'add' to append one, 'replace' to substitute (prefer swap_exercise for "
            "same-muscle swaps). Changes show on the user's screen immediately."
        ),
        "input_schema": {
            "type": "object",
            "required": ["changes"],
            "properties": {
                "changes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["op"],
                        "properties": {
                            "op": {"type": "string", "enum": ["add", "remove", "replace", "adjust"]},
                            "exercise_name": {"type": "string"},
                            "to_exercise": {"type": "string"},
                            "sets": {"type": "integer"},
                            "reps": {"type": "integer"},
                            "note": {"type": "string"},
                        },
                    },
                }
            },
        },
    },
    {
        "name": "go_to_exercise",
        "description": (
            "Move the workout screen to a different exercise in today's session. "
            "Omit exercise_name to advance to the NEXT exercise — use this when the "
            "user says 'next exercise', 'moving on', 'done with these', or 'skip "
            "this one'. Pass exercise_name to jump to a specific one ('go back to "
            "bench'). This only changes position — it never logs sets."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "exercise_name": {
                    "type": "string",
                    "description": "Target exercise from today's session. Omit to advance to the next one.",
                },
            },
        },
    },
    {
        "name": "propose_workout_plan",
        "description": (
            "Propose a complete new weekly workout plan for the user's review. This shows an "
            "interactive card in the chat — it does NOT save the plan; the user must tap "
            "Accept. Ground programming decisions with search_knowledge first, and respect "
            "the user's profile (training_days, session_minutes, equipment, active injuries). "
            "To revise after feedback, call this again with the FULL updated plan."
        ),
        "input_schema": {
            "type": "object",
            "required": ["name", "days"],
            "properties": {
                "name": {"type": "string", "description": "Short plan name, e.g. '4-Day Upper/Lower'."},
                "split_type": {
                    "type": "string",
                    "description": "e.g. push/pull/legs, upper/lower, full-body",
                },
                "rationale": {
                    "type": "string",
                    "description": "1-3 sentences on why this plan fits the user.",
                },
                "days": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 7,
                    "items": {
                        "type": "object",
                        "required": ["day_label", "title", "exercises"],
                        "properties": {
                            "day_label": {
                                "type": "string",
                                "description": "Weekday short label: Mon, Tue, Wed, Thu, Fri, Sat, Sun.",
                            },
                            "title": {"type": "string"},
                            "est_minutes": {"type": "integer"},
                            "exercises": {
                                "type": "array",
                                "minItems": 1,
                                "items": {
                                    "type": "object",
                                    "required": ["exercise_name", "sets", "reps_low"],
                                    "properties": {
                                        "exercise_id": {
                                            "type": "string",
                                            "description": "Catalog id if known, e.g. ex-bench.",
                                        },
                                        "exercise_name": {"type": "string"},
                                        "sets": {"type": "integer", "minimum": 1, "maximum": 10},
                                        "reps_low": {"type": "integer", "minimum": 1},
                                        "reps_high": {"type": "integer"},
                                        "note": {"type": "string"},
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    {
        "name": "escalate_to_reasoning",
        "description": (
            "Hand off to the deeper reasoning model BEFORE answering. Call this for: "
            "user-reported pain/injury/dizziness (safety), changes to the training plan, or "
            "open-ended / knowledge questions that need careful thought."
        ),
        "input_schema": {
            "type": "object",
            "required": ["reason"],
            "properties": {"reason": {"type": "string"}},
        },
    },
    {
        "name": "list_exercises",
        "description": (
            "List the exercise catalog (ids, names, muscle groups, equipment). Call this "
            "BEFORE propose_workout_plan and use the exact exercise_id values so every "
            "exercise links to its full detail page in the app."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "search_knowledge",
        "description": (
            "Search the fitness & health research corpus for evidence to ground an answer "
            "about training, technique, programming, nutrition, or injury/recovery. Prefer "
            "this (usually after escalating to reasoning) over answering substantive "
            "knowledge questions from memory. Returns cited passages."
        ),
        "input_schema": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "A focused natural-language query."},
                "doc_type": {
                    "type": "string",
                    "enum": ["study", "review", "guideline"],
                    "description": "Optional filter to a source type.",
                },
            },
        },
    },
]

# Tools that push a JSON packet to the client UI before the audio response.
UI_ACTION_TOOLS = {
    "start_timer",
    "stop_timer",
    "pause_timer",
    "log_set",
    "add_exercise_to_session",
    "swap_exercise",
    "modify_plan",
    "go_to_exercise",
    "propose_workout_plan",  # emits {"type": "plan_proposal", ...}
    "report_injury",
}

# Internal routing tool handled in the agent loop, not by execute_tool.
ROUTING_TOOLS = {"escalate_to_reasoning"}


# Tools that must remain callable no matter the tier, because onboarding's plan
# generation runs through this same loop and breaks without them.
ESSENTIAL_TOOLS = frozenset({"list_exercises", "propose_workout_plan"})


def tools_for_tier(tier: str) -> list[dict]:
    """
    The tool list for one tier — Premium capabilities removed below it.

    Filtering the definitions (rather than only refusing at execution) means the
    model never learns the tool exists, so it doesn't narrate a capability the
    customer doesn't have. execute_tool re-checks anyway; see the tier gate there.

    Cost of doing this: TOOL_DEFINITIONS sits in the cached system block, so
    there is now one prompt-cache variant per tier. Three variants is cheap
    against not shipping paid features for free.
    """
    from app.entitlements import PREMIUM_TOOLS  # local: avoids an import cycle

    if tier == "premium":
        return TOOL_DEFINITIONS
    return [t for t in TOOL_DEFINITIONS if t["name"] not in PREMIUM_TOOLS]


# ── Execution context ─────────────────────────────────────────────────────────

@dataclass
class ToolContext:
    user_id: str
    session_id: str | None
    db: AsyncClient
    app_actions: list[dict] = field(default_factory=list)
    # Pre-signup plan generation: profile facts come from the request payload
    # instead of the DB, and NOTHING persists. When set, only the read-only
    # generation tools are callable (enforced in execute_tool).
    anonymous_profile: dict | None = None
    # The caller's subscription tier, for the Premium tool gate in execute_tool.
    # Defaults to "premium" so internal callers that build a context directly
    # keep working; every request path sets it explicitly.
    tier: str = "premium"


# ── Injury recording ──────────────────────────────────────────────────────────

def _injury_sentence(
    body_part: str, severity: str | None, notes: str | None, avoid: list[str] | None
) -> str:
    """One self-contained sentence for personal memory.

    The `injuries` row is the structured truth (and is what the safety layer filters on);
    this is the prose copy, so semantic recall can surface "my knee" when the user later
    says "that thing that was bothering me".
    """
    parts = [f"Reported {severity + ' ' if severity else ''}{body_part} pain"]
    if notes:
        parts.append(f" — {notes.rstrip('.')}")
    if avoid:
        parts.append(f". Avoid: {', '.join(avoid)}")
    return "".join(parts).rstrip(".") + "."


async def record_injury(
    user_id: str,
    db: AsyncClient,
    *,
    body_part: str,
    severity: str | None = None,
    notes: str | None = None,
    avoid_movements: list[str] | None = None,
    session_id: str | None = None,
) -> dict:
    """Persist an injury and mirror it into personal memory. Returns the injury row.

    Shared by the `report_injury` tool and POST /session/{id}/note so the two entry points
    can't drift — the spoken path and the tapped path must record the same thing.
    """
    row: dict = {"user_id": user_id, "body_part": body_part, "status": "active"}
    if severity:
        row["severity"] = severity
    if notes:
        row["notes"] = notes
    if avoid_movements:
        row["avoid_movements"] = avoid_movements
    if session_id:
        row["reported_in_session"] = session_id

    res = await db.table("injuries").insert(row).execute()
    injury = res.data[0] if res.data else row

    # 002_mvp_schema.sql calls this table "feeds Personal RAG" — this is that wire.
    from app.rag import memory

    await memory.remember(
        user_id,
        "injury",
        _injury_sentence(body_part, severity, notes, avoid_movements),
        db,
        source_id=injury.get("id"),
    )
    return injury


# ── Session plan helpers ──────────────────────────────────────────────────────
# Pure functions (no DB) so today-only plan surgery is unit-testable. The
# session-state renderer in core.py imports _names_match/_pick_today_workout
# from here — they encode the ONE matching rule shared by the prompt, the
# tools, and (mirrored in TS) the client.

def _resolve_set_slot(
    existing_indexes: list[int], set_number: int | None
) -> tuple[int, str]:
    """Which completed_sets slot a log_set call writes, and how.

    set_number is the user's 1-based ordinal ("first set" = 1). Omitted →
    append after the highest logged slot (max+1, NOT count: manual UI logging
    can leave gaps, and a count-append would collide with an existing row).
    Named → ("corrected") if that slot already has a row, else fill it.
    """
    if set_number is None:
        nxt = (max(existing_indexes) + 1) if existing_indexes else 0
        return nxt, "logged"
    idx = set_number - 1
    return idx, ("corrected" if idx in existing_indexes else "logged")


def _names_match(a: str | None, b: str | None) -> bool:
    """Loose exercise-name match: the agent, the UI, and the plan snapshot each
    write names from slightly different sources ("Bench Press" vs "bench press")."""
    if not a or not b:
        return False
    a, b = a.strip().lower(), b.strip().lower()
    return a == b or a in b or b in a


def _pick_today_workout(
    snapshot: dict,
    current_exercise: str | None,
    logged_names: list[str],
) -> dict | None:
    """Which day of the snapshot is being trained right now, best signal first:
    the day the client opened (recorded at session start), then the day holding
    current_exercise, then the day the logged sets overlap most, then weekday."""
    workouts = snapshot.get("workouts") or []
    if not workouts:
        return None

    today_id = snapshot.get("today_workout_id")
    if today_id:
        for w in workouts:
            if w.get("id") == today_id:
                return w

    if current_exercise:
        for w in workouts:
            if any(_names_match(current_exercise, e.get("exercise_name")) for e in w.get("exercises") or []):
                return w

    if logged_names:
        best, best_overlap = None, 0
        for w in workouts:
            plan_names = [e.get("exercise_name") for e in w.get("exercises") or []]
            overlap = sum(1 for n in logged_names if any(_names_match(n, p) for p in plan_names))
            if overlap > best_overlap:
                best, best_overlap = w, overlap
        if best:
            return best

    weekday = datetime.now(timezone.utc).strftime("%a").lower()
    for w in workouts:
        label = (w.get("day_label") or "").strip().lower()
        if label[:3] == weekday:
            return w
    return None


def _completed_for(completed_counts: dict[str, int], plan_name: str | None) -> int:
    """Fuzzy-count logged sets for a plan exercise (logged names may differ)."""
    return next(
        (c for n, c in completed_counts.items() if _names_match(n, plan_name)), 0
    )


def _apply_changes_to_snapshot(
    snapshot: dict,
    changes: list[dict],
    completed_counts: dict[str, int],
    current_exercise: str | None,
) -> tuple[list[dict], list[str]]:
    """Mutate the session's plan_snapshot in place so today-only changes are
    real: the <session_state> renderer reads the snapshot, never the
    session_overrides audit list. Returns (applied_changes, unmatched_names).

    Rules: 'adjust' never shrinks below what's already logged; 'remove' of an
    exercise with logged sets truncates to those sets (it renders as DONE)
    instead of erasing history."""
    today = _pick_today_workout(snapshot, current_exercise, list(completed_counts))
    if today is None:
        return [], [c.get("exercise_name") or "?" for c in changes]

    exercises: list = today.setdefault("exercises", [])
    applied: list[dict] = []
    unmatched: list[str] = []

    for change in changes:
        op = change.get("op")
        name = change.get("exercise_name")

        if op == "add":
            if not name:
                unmatched.append("?")
                continue
            reps = change.get("reps") or 10
            exercises.append({
                "exercise_name": name,
                "exercise_id": None,
                "note": change.get("note"),
                "sort_order": len(exercises),
                "target_sets": [
                    {"id": f"adhoc-{len(exercises)}-{i}", "exerciseId": None,
                     "targetReps": reps, "weight": None}
                    for i in range(change.get("sets") or 3)
                ],
            })
            applied.append(change)
            continue

        target = next(
            (e for e in exercises if _names_match(name, e.get("exercise_name"))), None
        )
        if target is None:
            unmatched.append(name or "?")
            continue

        if op == "adjust":
            floor = _completed_for(completed_counts, target.get("exercise_name"))
            sets_list = list(target.get("target_sets") or [])
            if change.get("sets") is not None:
                n = max(change["sets"], floor)
                if n < len(sets_list):
                    sets_list = sets_list[:n]
                else:
                    last = sets_list[-1] if sets_list else {
                        "exerciseId": target.get("exercise_id"),
                        "targetReps": change.get("reps") or 10,
                        "weight": None,
                    }
                    while len(sets_list) < n:
                        sets_list.append(
                            {**last, "id": f"{last.get('id') or 'ts'}-adj{len(sets_list)}"}
                        )
            if change.get("reps") is not None:
                # Retarget only sets the user hasn't done yet (mirrors the client).
                for i in range(floor, len(sets_list)):
                    sets_list[i] = {**sets_list[i], "targetReps": change["reps"]}
                    sets_list[i].pop("repsHigh", None)
            target["target_sets"] = sets_list
            if change.get("note"):
                target["note"] = change["note"]
            applied.append(change)
        elif op == "remove":
            n_done = _completed_for(completed_counts, target.get("exercise_name"))
            if n_done > 0:
                target["target_sets"] = list(target.get("target_sets") or [])[:n_done]
            else:
                exercises.remove(target)
            applied.append(change)
        elif op == "replace":
            if not change.get("to_exercise"):
                unmatched.append(name or "?")
                continue
            target["exercise_name"] = change["to_exercise"]
            target["exercise_id"] = None
            applied.append(change)
        else:
            unmatched.append(name or "?")

    return applied, unmatched


def _resolve_goto_target(
    snapshot: dict | None,
    overrides: dict,
    current_exercise: str | None,
    completed_counts: dict[str, int],
    requested: str | None,
) -> dict:
    """Resolve go_to_exercise against today's ordered exercise list.
    Returns {"name", "error", "position", "total", "exercises"} — error is
    "end_of_workout" or a human-readable message, and name is None then."""
    names: list[str] = []
    exercises: list[dict] = []
    today = (
        _pick_today_workout(snapshot, current_exercise, list(completed_counts))
        if snapshot else None
    )
    if today:
        exercises = today.get("exercises") or []
        names = [e.get("exercise_name") or "?" for e in exercises]

    # Overrides: swaps rename in place; added exercises append. (The client
    # inserts additions mid-list, but end-of-list is close enough for "next".)
    for swap in overrides.get("swaps") or []:
        for i, n in enumerate(names):
            if _names_match(swap.get("from"), n):
                names[i] = swap.get("to") or n
    for added in overrides.get("added_exercises") or []:
        if not any(_names_match(added, n) for n in names):
            names.append(added)

    def _result(name: str | None, error: str | None, position: int) -> dict:
        return {
            "name": name, "error": error,
            "position": position, "total": len(names), "exercises": names,
        }

    if not names:
        return _result(None, "No plan for this session.", 0)

    if requested:
        for i, n in enumerate(names):
            if _names_match(requested, n):
                return _result(n, None, i + 1)
        return _result(None, f"'{requested}' isn't in today's session.", 0)

    cur = next(
        (i for i, n in enumerate(names) if _names_match(current_exercise, n)), None
    )
    if cur is None:
        # Between exercises (or never positioned): snap to the first unfinished
        # one — the same inference the session-state renderer uses.
        def _has_sets_left(i: int) -> bool:
            if i >= len(exercises):
                return True  # override-added exercise: no target data, assume open
            targets = exercises[i].get("target_sets") or []
            if not targets:
                return True
            return _completed_for(completed_counts, names[i]) < len(targets)

        idx = next((i for i in range(len(names)) if _has_sets_left(i)), 0)
        return _result(names[idx], None, idx + 1)

    if cur + 1 >= len(names):
        return _result(None, "end_of_workout", 0)
    return _result(names[cur + 1], None, cur + 2)


async def _load_session_position(
    ctx: ToolContext,
) -> tuple[dict | None, dict, str | None, dict[str, int]]:
    """(plan_snapshot, session_overrides, current_exercise, completed-set counts)
    for the active session — the inputs both plan-surgery tools need."""
    sres = await ctx.db.table("workout_sessions").select(
        "plan_snapshot, session_overrides, current_exercise"
    ).eq("id", ctx.session_id).single().execute()
    row = sres.data or {}
    logged = await ctx.db.table("completed_sets").select("exercise_name").eq(
        "session_id", ctx.session_id
    ).execute()
    counts: dict[str, int] = {}
    for r in logged.data or []:
        n = r.get("exercise_name") or "?"
        counts[n] = counts.get(n, 0) + 1
    return (
        row.get("plan_snapshot"),
        row.get("session_overrides") or {},
        row.get("current_exercise"),
        counts,
    )


# ── Tool execution ────────────────────────────────────────────────────────────

async def execute_tool(
    name: str, args: dict, ctx: ToolContext
) -> tuple[dict, list[dict]]:
    """Execute a tool. Returns (result_for_claude, app_action_packets).

    Isolation: every write is scoped to ctx.user_id, which comes structurally from
    the request (never a model-supplied argument). A missing user_id scope is a P0 bug.
    """
    ctx.app_actions = []

    # Anonymous generation has no user rows to read or write — anything beyond
    # the catalog and the (non-persisting) proposal is off the table.
    if ctx.anonymous_profile is not None and name not in (
        "list_exercises",
        "propose_workout_plan",
    ):
        return {"error": f"{name} is not available before an account exists."}, []

    # Defence in depth for the Premium tools. They are already filtered out of
    # the definitions the model receives, so reaching here means either a stale
    # cached tool list or a model inventing a call — neither should execute.
    from app.entitlements import PREMIUM_TOOLS

    if name in PREMIUM_TOOLS and ctx.tier != "premium":
        return {"error": f"{name} requires a Premium subscription."}, []

    if name == "start_timer":
        duration = args.get("duration_seconds", 90)
        ctx.app_actions.append({"type": "app_action", "action": "start_timer", "duration": duration})
        return {"status": "timer_started", "duration_seconds": duration}, ctx.app_actions

    if name == "pause_timer":
        ctx.app_actions.append({"type": "app_action", "action": "pause_timer"})
        return {"status": "timer_paused"}, ctx.app_actions

    if name == "stop_timer":
        ctx.app_actions.append({"type": "app_action", "action": "stop_timer"})
        return {"status": "timer_stopped"}, ctx.app_actions

    if name == "log_set":
        if not ctx.session_id:
            return {"error": "No active session"}, []

        exercise_name = args["exercise_name"]
        # Resolve to a catalog/user exercise id (case-insensitive); keep the name regardless.
        ex_res = await ctx.db.table("exercises").select("id").ilike(
            "name", exercise_name
        ).eq("is_active", True).limit(1).execute()
        exercise_id = ex_res.data[0]["id"] if ex_res.data else None

        # Slots already written for this exercise in this session — the user's
        # spoken ordinal ("first set") targets one of them; no ordinal appends.
        idx_res = await ctx.db.table("completed_sets").select(
            "set_index"
        ).eq("session_id", ctx.session_id).eq("exercise_name", exercise_name).execute()
        existing = [
            r["set_index"] for r in (idx_res.data or [])
            if isinstance(r.get("set_index"), int)
        ]
        set_index, mode = _resolve_set_slot(existing, args.get("set_number"))

        row: dict = {
            "user_id": ctx.user_id,
            "session_id": ctx.session_id,
            "exercise_id": exercise_id,
            "exercise_name": exercise_name,
            "set_index": set_index,
            "reps": args["reps"],
        }
        if "weight" in args:
            row["weight"] = args["weight"]
            unit = args.get("weight_unit")
            if unit is None:
                # The model rarely hears a unit — default to the user's profile.
                prof = await ctx.db.table("profiles").select("units").eq(
                    "user_id", ctx.user_id
                ).limit(1).execute()
                unit = (prof.data[0].get("units") if prof.data else None) or "lbs"
            row["weight_unit"] = unit
        # Upsert on the slot key (012): a correction updates only the columns
        # present here, so an omitted weight survives a reps-only correction.
        await ctx.db.table("completed_sets").upsert(
            row, on_conflict="session_id,exercise_name,set_index"
        ).execute()

        # Logging IS the position signal for hands-free users, who never tap
        # "next exercise" in the UI — keep the session's current_exercise fresh.
        await ctx.db.table("workout_sessions").update(
            {"current_exercise": exercise_name, "updated_at": utcnow()}
        ).eq("id", ctx.session_id).execute()

        ctx.app_actions.append({
            "type": "app_action",
            "action": "log_set",
            "exercise": exercise_name,
            "reps": args["reps"],
            "weight": args.get("weight"),
            "set_index": set_index,
            "mode": mode,
        })
        status = "set_corrected" if mode == "corrected" else "set_logged"
        return {
            "status": status,
            "set_number": set_index + 1,
            "set_index": set_index,
            **args,
        }, ctx.app_actions

    if name == "add_exercise_to_session":
        if not ctx.session_id:
            return {"error": "No active session"}, []

        exercise_name = args["exercise_name"]
        res = await ctx.db.table("workout_sessions").select("session_overrides").eq(
            "id", ctx.session_id
        ).single().execute()
        overrides: dict = (res.data or {}).get("session_overrides") or {}
        added: list = overrides.get("added_exercises", [])
        if exercise_name not in added:
            added.append(exercise_name)
        overrides["added_exercises"] = added

        await ctx.db.table("workout_sessions").update(
            {
                "session_overrides": overrides,
                "current_exercise": exercise_name,
                "updated_at": utcnow(),
            }
        ).eq("id", ctx.session_id).execute()

        ctx.app_actions.append({
            "type": "app_action",
            "action": "add_exercise",
            "exercise": exercise_name,
        })
        return {"status": "exercise_added", "exercise_name": exercise_name}, ctx.app_actions

    if name == "add_exercise":
        row = {
            "name": args["name"],
            "muscle_group": args["muscle_group"],
            "equipment": args["equipment"],
            "created_by": ctx.user_id,
        }
        if args.get("movement"):
            row["movement"] = args["movement"]
        if args.get("description"):
            row["description"] = args["description"]
        res = await ctx.db.table("exercises").insert(row).execute()
        created = res.data[0] if res.data else row
        return {"status": "exercise_created", "exercise": created}, []

    if name == "delete_exercise":
        exercise_id = args["exercise_id"]
        # Only the user's OWN custom rows (created_by = user_id). Shared catalog rows
        # have created_by = NULL and will not match — they cannot be deleted.
        res = await ctx.db.table("exercises").update(
            {"is_active": False}
        ).eq("id", exercise_id).eq("created_by", ctx.user_id).execute()
        if not res.data:
            return {
                "error": "Exercise not found, not yours, or part of the shared catalog (cannot delete)."
            }, []
        return {"status": "exercise_deleted", "exercise_id": exercise_id}, []

    if name == "get_current_session_state":
        if not ctx.session_id:
            return {"error": "No active session"}, []
        sess = await ctx.db.table("workout_sessions").select(
            "current_exercise, session_overrides"
        ).eq("id", ctx.session_id).single().execute()
        sets_res = await ctx.db.table("completed_sets").select(
            "exercise_name, set_index, reps, weight, weight_unit"
        ).eq("session_id", ctx.session_id).order("exercise_name").order("set_index").execute()

        grouped: dict[str, list] = {}
        for r in sets_res.data or []:
            grouped.setdefault(r["exercise_name"], []).append(
                {
                    "set_number": (r.get("set_index") or 0) + 1,
                    "reps": r["reps"],
                    "weight": r.get("weight"),
                    "weight_unit": r.get("weight_unit"),
                }
            )
        return {
            "current_exercise": (sess.data or {}).get("current_exercise"),
            "exercises": [{"name": k, "sets": v} for k, v in grouped.items()],
            "overrides": (sess.data or {}).get("session_overrides") or {},
        }, []

    if name == "get_workout_plan":
        # In-session snapshot first (stable for the workout), then the durable
        # active plan, then an explicit "no plan" the model can act on.
        if ctx.session_id:
            res = await ctx.db.table("workout_sessions").select("plan_snapshot").eq(
                "id", ctx.session_id
            ).single().execute()
            snapshot = (res.data or {}).get("plan_snapshot")
            if snapshot:
                return {"plan": snapshot, "source": "session_snapshot"}, []
        from app.plan_store import get_active_plan_tree

        plan = await get_active_plan_tree(ctx.user_id, ctx.db, ctx.tier)
        if plan:
            return {"plan": plan, "source": "active_plan"}, []
        return {"plan": None, "note": "User has no plan yet — offer to create one."}, []

    if name == "propose_workout_plan":
        return await _propose_workout_plan(args, ctx)

    if name == "report_injury":
        injury = await record_injury(
            ctx.user_id,
            ctx.db,
            body_part=args["body_part"],
            severity=args.get("severity"),
            notes=args.get("notes"),
            avoid_movements=args.get("avoid_movements"),
            session_id=ctx.session_id,
        )
        # Give the spoken path the same confirmation the tapped one gets. Recording an
        # injury used to be completely invisible: the prompt forbids reading the action
        # note aloud, so the user said "my knee hurts" and saw nothing happen at all.
        ctx.app_actions.append({
            "type": "app_action",
            "action": "injury_recorded",
            "body_part": injury.get("body_part"),
        })
        return {"status": "injury_recorded", "injury": injury}, ctx.app_actions

    if name == "get_exercise_history":
        from app import progression

        exercise_name = args["exercise_name"]
        res = (
            await ctx.db.table("completed_sets")
            .select("exercise_name, reps, weight, weight_unit, logged_at")
            .eq("user_id", ctx.user_id)
            .order("logged_at", desc=True)
            .limit(600)
            .execute()
        )
        rows = res.data or []
        sessions = progression.sessions_for(rows, exercise_name)
        if not sessions:
            return {
                "exercise": exercise_name,
                "sessions": [],
                "note": "Never logged — no history to read from.",
            }, []

        history = [
            {
                "date": str(s[0].get("logged_at"))[:10],
                "sets": [
                    {"reps": r.get("reps"), "weight": r.get("weight")} for r in s
                ],
                "unit": next((r.get("weight_unit") for r in s if r.get("weight_unit")), None),
            }
            for s in sessions[:8]
        ]
        best = max(
            (r for r in rows
             if (r.get("exercise_name") or "").strip().lower()
             == exercise_name.strip().lower() and r.get("weight") and r.get("reps")),
            key=lambda r: progression.estimate_1rm(float(r["weight"]), int(r["reps"])),
            default=None,
        )
        return {
            "exercise": exercise_name,
            "sessions": history,
            "best_set": (
                {
                    "weight": best["weight"],
                    "reps": best["reps"],
                    "unit": best.get("weight_unit"),
                    "date": str(best.get("logged_at"))[:10],
                    "estimated_1rm": round(
                        progression.estimate_1rm(float(best["weight"]), int(best["reps"])), 1
                    ),
                }
                if best else None
            ),
            "verdict": progression.stall_verdict(rows, exercise_name),
            "next_target": progression.next_target(rows, exercise_name),
        }, []

    if name == "remember_about_user":
        from app.rag import memory

        rid = await memory.remember(
            ctx.user_id, args.get("kind") or "preference", args["fact"], ctx.db
        )
        # A failed write is not worth an error the model will apologise for — the fact is
        # still in this conversation's history either way.
        return {"status": "remembered" if rid else "not_stored"}, []

    if name == "swap_exercise":
        from_name = args["from_exercise"]
        from_res = await ctx.db.table("exercises").select(
            "id, name, muscle_group, equipment, movement"
        ).ilike("name", from_name).eq("is_active", True).limit(1).execute()
        if not from_res.data:
            return {"error": f"'{from_name}' not found in the catalog."}, []
        from_ex = from_res.data[0]

        if args.get("to_exercise"):
            to_res = await ctx.db.table("exercises").select(
                "id, name, muscle_group, equipment, movement"
            ).ilike("name", args["to_exercise"]).eq("is_active", True).limit(1).execute()
            if not to_res.data:
                return {
                    "error": f"'{args['to_exercise']}' is not in the catalog. Use add_exercise first."
                }, []
            to_ex = to_res.data[0]
        else:
            # Auto-pick: same muscle group, prefer the same movement pattern.
            cand = await ctx.db.table("exercises").select(
                "id, name, muscle_group, equipment, movement"
            ).eq("muscle_group", from_ex["muscle_group"]).eq(
                "is_active", True
            ).neq("id", from_ex["id"]).execute()
            candidates = cand.data or []
            same_move = [c for c in candidates if c.get("movement") == from_ex.get("movement")]
            pool = same_move or candidates
            if not pool:
                return {"error": "No alternative found for that muscle group. Use add_exercise."}, []
            to_ex = pool[0]

        if ctx.session_id:
            sres = await ctx.db.table("workout_sessions").select("session_overrides").eq(
                "id", ctx.session_id
            ).single().execute()
            overrides: dict = (sres.data or {}).get("session_overrides") or {}
            swaps: list = overrides.get("swaps", [])
            swaps.append({"from": from_ex["name"], "to": to_ex["name"], "reason": args.get("reason")})
            overrides["swaps"] = swaps
            await ctx.db.table("workout_sessions").update(
                {"session_overrides": overrides, "updated_at": utcnow()}
            ).eq("id", ctx.session_id).execute()
            ctx.app_actions.append({
                "type": "app_action", "action": "swap_exercise",
                "from": from_ex["name"], "to": to_ex["name"],
            })
            return {"status": "swapped", "from": from_ex["name"], "to": to_ex["name"]}, ctx.app_actions

        return {"status": "suggested", "from": from_ex["name"], "to": to_ex["name"]}, []

    if name == "modify_plan":
        if not ctx.session_id:
            return {"error": "No active session to modify"}, []
        changes: list = args.get("changes") or []
        snapshot, overrides, current_ex, counts = await _load_session_position(ctx)

        # Mutate the snapshot (the live truth the renderer reads) and keep the
        # override list as an audit trail. Read-modify-write on the JSONB is
        # safe: one active session per user, tools run sequentially per turn,
        # and the client PATCH only ever writes current_exercise.
        applied: list = []
        unmatched: list = []
        update: dict = {"updated_at": utcnow()}
        if snapshot:
            applied, unmatched = _apply_changes_to_snapshot(
                snapshot, changes, counts, current_ex
            )
            update["plan_snapshot"] = snapshot

        mods: list = overrides.get("plan_modifications", [])
        mods.extend(changes)
        overrides["plan_modifications"] = mods
        update["session_overrides"] = overrides

        await ctx.db.table("workout_sessions").update(update).eq(
            "id", ctx.session_id
        ).execute()
        ctx.app_actions.append({"type": "app_action", "action": "modify_plan", "changes": changes})
        result: dict = {"status": "plan_modified", "applied": applied or changes}
        if unmatched:
            result["unmatched"] = unmatched
        if not snapshot:
            result["note"] = "no plan snapshot for this session; recorded as intent only"
        return result, ctx.app_actions

    if name == "go_to_exercise":
        if not ctx.session_id:
            return {"error": "No active session"}, []
        snapshot, overrides, current_ex, counts = await _load_session_position(ctx)
        res = _resolve_goto_target(
            snapshot, overrides, current_ex, counts, args.get("exercise_name")
        )
        if res["error"] == "end_of_workout":
            return {
                "status": "end_of_workout",
                "note": "That was the last exercise — suggest wrapping up. Finishing stays a user tap.",
            }, []
        if res["error"]:
            return {"error": res["error"], "exercises": res["exercises"]}, []

        target = res["name"]
        await ctx.db.table("workout_sessions").update(
            {"current_exercise": target, "updated_at": utcnow()}
        ).eq("id", ctx.session_id).execute()
        ctx.app_actions.append(
            {"type": "app_action", "action": "go_to_exercise", "exercise": target}
        )
        return {
            "status": "moved",
            "exercise": target,
            "position": f"{res['position']}/{res['total']}",
        }, ctx.app_actions

    if name == "list_exercises":
        res = await ctx.db.table("exercises").select(
            "id, name, muscle_group, equipment"
        ).eq("is_active", True).order("muscle_group").execute()
        return {"exercises": res.data or []}, []

    if name == "search_knowledge":
        # Knowledge RAG. Read-only, no UI action. Fault-tolerant inside pipeline.search;
        # lazy import keeps boot cheap (embedder/reranker models load on first call).
        from app.rag import pipeline

        return await pipeline.search(args, ctx), []

    return {"error": f"Unknown tool: {name}"}, []


# ── Plan proposals ────────────────────────────────────────────────────────────

# The app matches workouts to weekdays by these exact short labels. The model
# is told to use them, but normalize defensively ("Monday", "TUES", "Day 1"…).
_DAY_CANON = {
    "sun": "Sun", "sunday": "Sun",
    "mon": "Mon", "monday": "Mon",
    "tue": "Tue", "tues": "Tue", "tuesday": "Tue",
    "wed": "Wed", "weds": "Wed", "wednesday": "Wed",
    "thu": "Thu", "thur": "Thu", "thurs": "Thu", "thursday": "Thu",
    "fri": "Fri", "friday": "Fri",
    "sat": "Sat", "saturday": "Sat",
}
_DAY_SPREAD = {
    1: ["Mon"],
    2: ["Mon", "Thu"],
    3: ["Mon", "Wed", "Fri"],
    4: ["Mon", "Tue", "Thu", "Fri"],
    5: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    7: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
}


def _normalize_day_labels(days: list[dict], warnings: list[str]) -> None:
    """Coerce every day_label to Sun..Sat in place; unknowns get a sensible
    weekly spread so the app can always resolve 'today's workout'."""
    spread = _DAY_SPREAD.get(len(days), _DAY_SPREAD[7])
    for idx, day in enumerate(days):
        raw = str(day.get("day_label") or "").strip().lower()
        canon = _DAY_CANON.get(raw)
        if canon is None:
            canon = spread[idx % len(spread)]
            if raw:
                warnings.append(
                    f"Day label '{day.get('day_label')}' isn't a weekday — scheduled on {canon}."
                )
        day["day_label"] = canon

async def _load_catalog(db: AsyncClient) -> list[dict]:
    res = await db.table("exercises").select(
        "id, name, movement, equipment"
    ).eq("is_active", True).execute()
    return res.data or []


def _name_tokens(name: str) -> frozenset[str]:
    """Normalized word set: lowercase, punctuation-stripped, naive de-plural
    (triceps/tricep, dumbbells/dumbbell)."""
    words = re.sub(r"[^a-z0-9 ]", " ", name.lower()).split()
    return frozenset(w[:-1] if len(w) > 3 and w.endswith("s") else w for w in words)


def _match_exercise(catalog: list[dict], exercise_id: str | None, name: str) -> dict | None:
    """Resolve a proposed exercise against the catalog: trust-but-verify the
    model-supplied id, then token-set matching so word order ("Cable Seated
    Row" vs "Seated Cable Row") and qualifiers ("Barbell Back Squat" vs "Back
    Squat") still resolve. Ambiguous names stay unmatched (saved as free text)
    rather than guessing a different exercise."""
    if exercise_id:
        for row in catalog:
            if row["id"] == exercise_id:
                return row
    needle = _name_tokens(name)
    if not needle:
        return None

    # The movement noun is usually the last word ("... Curl" vs "... Press") —
    # a fuzzy match that changes it is a different exercise, not a variant.
    head = _name_tokens(name.split()[-1]) if name.split() else frozenset()

    best: tuple[float, dict] | None = None
    for row in catalog:
        tokens = _name_tokens(row["name"])
        if tokens == needle:
            return row
        # Subset either way = one side just adds qualifiers → strong match.
        subset = tokens <= needle or needle <= tokens
        jaccard = len(tokens & needle) / len(tokens | needle)
        score = 1.0 if subset else jaccard
        if not subset and head and not (head & tokens):
            continue
        if score >= 0.5 and (best is None or score > best[0]):
            best = (score, row)
    return best[1] if best else None


async def _propose_workout_plan(args: dict, ctx: ToolContext) -> tuple[dict, list[dict]]:
    """Validate + normalize the proposed plan, stash it durably, emit the card
    packet. Does NOT write the plan tables — acceptance does (plan_store)."""
    days = args.get("days") or []
    if not days:
        return {"error": "A plan needs at least one day."}, []

    if ctx.anonymous_profile is not None:
        # Pre-signup: the answers ARE the profile. No injuries rows exist yet
        # (areas ride the payload as plain strings), so movement checks skip.
        profile = ctx.anonymous_profile
        avoid_movements: set[str] = set()
    else:
        profile_res = await ctx.db.table("profiles").select(
            "training_days, session_minutes, equipment"
        ).eq("user_id", ctx.user_id).execute()
        profile = profile_res.data[0] if profile_res.data else {}

        injuries_res = await ctx.db.table("injuries").select(
            "body_part, avoid_movements"
        ).eq("user_id", ctx.user_id).eq("status", "active").execute()
        avoid_movements = {
            m for row in (injuries_res.data or []) for m in (row.get("avoid_movements") or [])
        }

    warnings: list[str] = []
    _normalize_day_labels(days, warnings)
    training_days = profile.get("training_days")
    if training_days and len(days) != training_days:
        warnings.append(
            f"Plan has {len(days)} days but the user asked for {training_days}/week."
        )

    user_equipment = set(profile.get("equipment") or [])
    session_minutes = profile.get("session_minutes")

    catalog = await _load_catalog(ctx.db)
    normalized_days = []
    for day in days:
        norm_exercises = []
        for ex in day.get("exercises") or []:
            resolved = _match_exercise(
                catalog, ex.get("exercise_id"), ex.get("exercise_name") or ""
            )
            if resolved:
                ex = {**ex, "exercise_id": resolved["id"], "exercise_name": resolved["name"]}
                if user_equipment and resolved.get("equipment") not in (
                    user_equipment | {"Bodyweight", None}
                ):
                    warnings.append(
                        f"{resolved['name']} needs {resolved.get('equipment')} — "
                        "not in the user's equipment."
                    )
                if resolved.get("movement") in avoid_movements:
                    warnings.append(
                        f"{resolved['name']} is a {resolved.get('movement')} movement, "
                        "which an active injury says to avoid."
                    )
            else:
                ex = {**ex, "exercise_id": None}
                warnings.append(
                    f"'{ex.get('exercise_name')}' isn't in the catalog — it will be "
                    "saved by name only."
                )
            norm_exercises.append(ex)
        if session_minutes and day.get("est_minutes") and day["est_minutes"] > session_minutes * 1.5:
            warnings.append(
                f"{day.get('title')} is ~{day['est_minutes']}min vs the user's "
                f"{session_minutes}min sessions."
            )
        normalized_days.append({**day, "exercises": norm_exercises})

    payload = {
        "name": args.get("name") or "My plan",
        "split_type": args.get("split_type") or "",
        "rationale": args.get("rationale") or "",
        "days": normalized_days,
    }

    if ctx.anonymous_profile is not None:
        # Nothing persists pre-signup — the client carries the payload across
        # the auth boundary and POSTs /plans/proposals/adopt once a user exists.
        proposal_id = None
    else:
        # One pending proposal at a time — a fresh one supersedes stale drafts.
        await ctx.db.table("plan_proposals").update({"status": "superseded", "updated_at": utcnow()}).eq(
            "user_id", ctx.user_id
        ).eq("status", "pending").execute()
        ins = await ctx.db.table("plan_proposals").insert(
            {"user_id": ctx.user_id, "payload": payload, "status": "pending"}
        ).execute()
        proposal_id = ins.data[0]["id"]

    ctx.app_actions.append(
        {
            "type": "plan_proposal",
            "proposal_id": proposal_id,
            "plan": payload,
            "warnings": warnings,
        }
    )
    return {
        "status": "proposal_shown",
        "proposal_id": proposal_id,
        "warnings": warnings,
        "note": "The user sees the plan card now and must tap Accept — do not claim it is saved.",
    }, ctx.app_actions


def blocks_to_dicts(content: list) -> list[dict]:
    """Convert Anthropic SDK content blocks to plain dicts for message history."""
    result = []
    for block in content:
        if block.type == "text":
            result.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            result.append({"type": "tool_use", "id": block.id, "name": block.name, "input": block.input})
    return result

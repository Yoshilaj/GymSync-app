import json
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
        "description": "Start a rest timer on the user's screen. Call this immediately after logging a set.",
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
            "Record a completed set to the current workout session. "
            "Call this when the user confirms they finished a set."
        ),
        "input_schema": {
            "type": "object",
            "required": ["exercise_name", "reps"],
            "properties": {
                "exercise_name": {"type": "string"},
                "reps": {"type": "integer"},
                "weight": {"type": "number"},
                "weight_unit": {"type": "string", "enum": ["kg", "lbs"]},
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
            "Apply changes to today's session plan (add, remove, replace, or adjust exercises). "
            "For a same-muscle substitution, prefer swap_exercise."
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
}

# Internal routing tool handled in the agent loop, not by execute_tool.
ROUTING_TOOLS = {"escalate_to_reasoning"}


# ── Execution context ─────────────────────────────────────────────────────────

@dataclass
class ToolContext:
    user_id: str
    session_id: str | None
    db: AsyncClient
    app_actions: list[dict] = field(default_factory=list)


# ── Tool execution ────────────────────────────────────────────────────────────

async def execute_tool(
    name: str, args: dict, ctx: ToolContext
) -> tuple[dict, list[dict]]:
    """Execute a tool. Returns (result_for_claude, app_action_packets).

    Isolation: every write is scoped to ctx.user_id, which comes structurally from
    the request (never a model-supplied argument). A missing user_id scope is a P0 bug.
    """
    ctx.app_actions = []

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

        # Next set index for this exercise within this session.
        count_res = await ctx.db.table("completed_sets").select(
            "id", count="exact"
        ).eq("session_id", ctx.session_id).eq("exercise_name", exercise_name).execute()
        set_index = count_res.count or 0

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
            row["weight_unit"] = args.get("weight_unit", "lbs")
        await ctx.db.table("completed_sets").insert(row).execute()

        ctx.app_actions.append({
            "type": "app_action",
            "action": "log_set",
            "exercise": exercise_name,
            "reps": args["reps"],
            "weight": args.get("weight"),
        })
        return {"status": "set_logged", "set_index": set_index, **args}, ctx.app_actions

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
                {"reps": r["reps"], "weight": r.get("weight"), "weight_unit": r.get("weight_unit")}
            )
        return {
            "current_exercise": (sess.data or {}).get("current_exercise"),
            "exercises": [{"name": k, "sets": v} for k, v in grouped.items()],
            "overrides": (sess.data or {}).get("session_overrides") or {},
        }, []

    if name == "get_workout_plan":
        if not ctx.session_id:
            return {"plan": None}, []
        res = await ctx.db.table("workout_sessions").select("plan_snapshot").eq(
            "id", ctx.session_id
        ).single().execute()
        return {"plan": (res.data or {}).get("plan_snapshot")}, []

    if name == "report_injury":
        row: dict = {"user_id": ctx.user_id, "body_part": args["body_part"], "status": "active"}
        if args.get("severity"):
            row["severity"] = args["severity"]
        if args.get("notes"):
            row["notes"] = args["notes"]
        if args.get("avoid_movements"):
            row["avoid_movements"] = args["avoid_movements"]
        if ctx.session_id:
            row["reported_in_session"] = ctx.session_id
        res = await ctx.db.table("injuries").insert(row).execute()
        return {"status": "injury_recorded", "injury": res.data[0] if res.data else row}, []

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
        sres = await ctx.db.table("workout_sessions").select("session_overrides").eq(
            "id", ctx.session_id
        ).single().execute()
        overrides = (sres.data or {}).get("session_overrides") or {}
        mods: list = overrides.get("plan_modifications", [])
        mods.extend(changes)
        overrides["plan_modifications"] = mods
        await ctx.db.table("workout_sessions").update(
            {"session_overrides": overrides, "updated_at": utcnow()}
        ).eq("id", ctx.session_id).execute()
        ctx.app_actions.append({"type": "app_action", "action": "modify_plan", "changes": changes})
        return {"status": "plan_modified", "applied": changes}, ctx.app_actions

    return {"error": f"Unknown tool: {name}"}, []


def blocks_to_dicts(content: list) -> list[dict]:
    """Convert Anthropic SDK content blocks to plain dicts for message history."""
    result = []
    for block in content:
        if block.type == "text":
            result.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            result.append({"type": "tool_use", "id": block.id, "name": block.name, "input": block.input})
    return result

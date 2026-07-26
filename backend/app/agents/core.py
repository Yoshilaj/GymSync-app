"""
Agent orchestration.
_agent_events()  — core loop, yields plain dicts (shared by SSE and WebSocket)
run_chat_agent() — SSE wrapper for POST /api/chat
LangGraph state machine (Step 11) will wrap _agent_events with state routing.
"""
import asyncio
import json
from collections.abc import AsyncGenerator

from anthropic import AsyncAnthropic
from supabase import AsyncClient

from app.agents import conversation_store
from app.agents.personalities import build_system_prompt
from app.agents.tools import TOOL_DEFINITIONS, ToolContext, blocks_to_dicts, execute_tool, utcnow
from app.config import settings

# Two-tier routing: every live turn starts on the fast model with the full tool set.
# The model itself calls escalate_to_reasoning to hand off to the reasoning model for
# safety (pain/injury), plan changes, or open-ended reasoning — no extra classifier hop.
MODEL_FAST = "claude-haiku-4-5-20251001"
MODEL_REASONING = "claude-sonnet-4-6"

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
    res = await db.table("profiles").select(
        "units, experience, goals, preferences, sex, birth_year, height_cm, "
        "weight_kg, activity_level, training_days, session_minutes, equipment, onboarded_at"
    ).eq("user_id", user_id).execute()
    if not res.data:
        return ""
    p = res.data[0]

    inj = await db.table("injuries").select(
        "body_part, severity, avoid_movements"
    ).eq("user_id", user_id).eq("status", "active").execute()

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


async def _load_session_context(session_id: str | None, db: AsyncClient) -> str:
    if not session_id:
        return ""
    res = await db.table("workout_sessions").select(
        "current_exercise, session_overrides"
    ).eq("id", session_id).single().execute()
    if not res.data:
        return ""
    s = res.data
    # Recent sets logged this session (compact). The full plan is fetched on demand
    # via the get_workout_plan tool, so it stays out of every turn's context.
    sets_res = await db.table("completed_sets").select(
        "exercise_name, reps, weight, weight_unit"
    ).eq("session_id", session_id).order("logged_at", desc=True).limit(15).execute()
    return (
        f"<session_state>\n"
        f"current_exercise: {s.get('current_exercise') or 'none'}\n"
        f"sets_logged_this_session: {json.dumps(sets_res.data or [])}\n"
        f"overrides: {json.dumps(s.get('session_overrides') or {})}\n"
        f"</session_state>\n\n"
    )


async def _save_history(
    session_id: str | None,
    existing: list[dict],
    user_message: str,
    assistant_text: str,
    db: AsyncClient,
    conversation_id: str | None = None,
    user_id: str | None = None,
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
    updated = existing + [
        {"role": "user", "content": user_message, "ts": utcnow()},
        {"role": "assistant", "content": assistant_text, "ts": utcnow()},
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
) -> AsyncGenerator[dict, None]:
    """
    Core agent loop. Yields plain event dicts:
      {"type": "text_delta", "text": "..."}
      {"type": "app_action", "action": "...", ...}
      {"type": "done"}
      {"type": "error", "message": "..."}
    """
    client = _get_client()
    ctx = ToolContext(user_id=user_id, session_id=session_id, db=db)

    personality = await _load_personality(user_id, db)
    history = await _load_history(session_id, conversation_id, db)
    session_ctx = await _load_session_context(session_id, db)
    profile_ctx = await _load_profile_context(user_id, db)

    system_text = build_system_prompt(
        personality["preset_id"], personality.get("system_prompt_override")
    )
    # Cached block: personality + rules + tool defs.
    # Changes only when the user switches personality — covers ~80% of tokens.
    system = [{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}]

    # Conversation history arrives pre-bounded from the store; the workout-session
    # JSONB path keeps its original last-10 replay window.
    replay = history if conversation_id else history[-10:]
    messages: list[dict] = [{"role": m["role"], "content": m["content"]} for m in replay]
    full_user_message = profile_ctx + session_ctx + user_message
    messages.append({"role": "user", "content": full_user_message})

    assistant_text_parts: list[str] = []
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
        yield {"type": "error", "message": str(exc)}


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


async def run_plan_generation(user_id: str, db: AsyncClient) -> dict:
    """
    Chat-free plan generation for onboarding. Drives the normal agent loop on
    the reasoning model, swallows text, and returns the plan_proposal packet
    (the tool has already persisted the plan_proposals row by then). No
    session/conversation ids → zero chat side effects. One internal retry.
    """
    last_error: str | None = None
    for _attempt in range(2):
        gen = _agent_events(
            GENERATION_MESSAGE,
            session_id=None,
            user_id=user_id,
            db=db,
            model=MODEL_REASONING,
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

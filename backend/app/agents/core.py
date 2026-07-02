"""
Agent orchestration.
run_agent_turn()     — single public chokepoint: security → timing/metrics → delegate.
                       ALL three callers (SSE chat, voice, WS-text) go through this so
                       production concerns can't miss a channel.
_core_agent_events() — the model loop, yields plain dicts (shared by SSE and WebSocket).
run_chat_agent()     — SSE wrapper for POST /api/chat.
"""
import json
from collections.abc import AsyncGenerator
from typing import Literal

from anthropic import AsyncAnthropic
from supabase import AsyncClient

from app.agents.personalities import build_system_prompt
from app.agents.tools import TOOL_DEFINITIONS, ToolContext, blocks_to_dicts, execute_tool, utcnow
from app.config import settings
from app.monitoring import RequestTimer, logger, metrics, traced
from app.rag import personal
from app.resilience import stream_with_resilience
from app.security import SecurityPipeline

Channel = Literal["text", "voice"]

# Two-tier routing: every live turn starts on the fast model with the full tool set.
# The model itself calls escalate_to_reasoning to hand off to the reasoning model for
# safety (pain/injury), plan changes, or open-ended reasoning — no extra classifier hop.
MODEL_FAST = "claude-haiku-4-5-20251001"
MODEL_REASONING = "claude-sonnet-4-6"

_anthropic: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _anthropic
    if _anthropic is None:
        # SDK owns transient retries on request establishment (429/5xx/connection);
        # the same-tier fallback model is handled in resilience.stream_with_resilience.
        _anthropic = AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            max_retries=settings.max_retries,
            timeout=settings.request_timeout_s,
        )
    return _anthropic


def _model_chain(model: str) -> list[str]:
    """Requested model first, then a distinct same-tier fallback (if configured).
    stream_with_resilience walks this list on pre-first-token failure — it never writes
    back to the loop's `model`, so escalation stays the sole owner of tier selection."""
    chain = [model]
    fallback = settings.model_fallback
    if fallback and fallback != model:
        chain.append(fallback)
    return chain


async def _load_personality(user_id: str, db: AsyncClient) -> dict:
    res = await db.table("personalities").select("preset_id, system_prompt_override").eq(
        "user_id", user_id
    ).execute()
    if res.data:
        return res.data[0]
    return {"preset_id": "supportive", "system_prompt_override": None}


async def _load_history(session_id: str | None, db: AsyncClient) -> list[dict]:
    if not session_id:
        return []
    res = await db.table("workout_sessions").select("chat_history").eq(
        "id", session_id
    ).single().execute()
    return res.data.get("chat_history") or []


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
) -> None:
    if not session_id:
        return
    updated = existing + [
        {"role": "user", "content": user_message, "ts": utcnow()},
        {"role": "assistant", "content": assistant_text, "ts": utcnow()},
    ]
    await db.table("workout_sessions").update(
        {"chat_history": updated[-20:], "updated_at": utcnow()}
    ).eq("id", session_id).execute()


async def _core_agent_events(
    user_message: str,
    session_id: str | None,
    user_id: str,
    db: AsyncClient,
    channel: Channel = "text",
) -> AsyncGenerator[dict, None]:
    """
    Core agent loop. Yields plain event dicts:
      {"type": "text_delta", "text": "..."}
      {"type": "app_action", "action": "...", ...}
      {"type": "usage", "input_tokens": int, "output_tokens": int}  # internal → metrics
      {"type": "done"}
      {"type": "error", "message": "..."}

    Reached only via run_agent_turn (never a router directly). `user_message` is already
    security-sanitized by the chokepoint. `usage` events are swallowed there for metrics
    and are never forwarded to a client.
    """
    client = _get_client()
    ctx = ToolContext(user_id=user_id, session_id=session_id, db=db)

    personality = await _load_personality(user_id, db)
    history = await _load_history(session_id, db)
    session_ctx = await _load_session_context(session_id, db)
    # Hybrid RAG entry: per-user semantic memory pre-fetched into the turn (best-effort;
    # returns "" if the RAG backend is absent). Knowledge stays a model-invoked tool.
    personal_ctx = await personal.prefetch(user_id, user_message, db, channel)

    system_text = build_system_prompt(
        personality["preset_id"], personality.get("system_prompt_override")
    )
    # Cached block: personality + rules + tool defs.
    # Changes only when the user switches personality — covers ~80% of tokens.
    system = [{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}]

    messages: list[dict] = [{"role": m["role"], "content": m["content"]} for m in history[-10:]]
    full_user_message = personal_ctx + session_ctx + user_message
    messages.append({"role": "user", "content": full_user_message})

    assistant_text_parts: list[str] = []
    model = MODEL_FAST  # escalate_to_reasoning bumps this to MODEL_REASONING

    try:
        while True:
            # SDK owns transient establishment retries; resilience adds only model
            # fallback (max_retries=0 here avoids stacking retries on the same model).
            final = None
            async for kind, payload in stream_with_resilience(
                client,
                models=_model_chain(model),
                max_retries=0,
                system=system,
                messages=messages,
                tools=TOOL_DEFINITIONS,
                max_tokens=1024,
            ):
                if kind == "delta":
                    assistant_text_parts.append(payload)
                    yield {"type": "text_delta", "text": payload}
                else:  # "final"
                    final = payload

            usage = getattr(final, "usage", None)
            if usage is not None:
                yield {
                    "type": "usage",
                    "input_tokens": getattr(usage, "input_tokens", 0),
                    "output_tokens": getattr(usage, "output_tokens", 0),
                }

            if final.stop_reason != "tool_use":
                await _save_history(
                    session_id, history, user_message, "".join(assistant_text_parts), db
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
        # Full detail to the log sink; a generic message to the client (no stack traces).
        logger.error(
            "agent_loop_error",
            extra={"extra_data": {"user_id": user_id, "channel": channel}},
            exc_info=exc,
        )
        yield {"type": "error", "message": "Something went wrong. Please try again."}


@traced(name="run_agent_turn")
async def run_agent_turn(
    user_message: str,
    session_id: str | None,
    user_id: str,
    db: AsyncClient,
    *,
    channel: Channel = "text",
) -> AsyncGenerator[dict, None]:
    """Single public entry point for one agent turn, used by ALL callers.

    Responsibilities layered around the core loop:
      • input security gate (blocking, one pass) BEFORE any model call
      • timing + TTFT + token/error metrics
      • output observation (PII/secret scan) into logs — never mutates the live stream

    Yields only client-facing events (text_delta / app_action / done / error); internal
    `usage` events are consumed here for metrics and dropped.
    """
    clean_text, in_flags = SecurityPipeline.process_input(user_message, channel)
    if in_flags.injection_suspected or in_flags.pii_types:
        logger.info(
            "input_flags",
            extra={"extra_data": {
                "user_id": user_id, "channel": channel,
                "injection": in_flags.injection_suspected,
                "pattern": in_flags.injection_pattern,
                "pii": in_flags.pii_types,
            }},
        )

    timer = RequestTimer().start()
    ttft_ms: float | None = None
    out_parts: list[str] = []
    input_tokens = output_tokens = 0
    errored = False

    try:
        if in_flags.blocked:
            # Text channel + hard injection hit → refuse without calling the model.
            refusal = "I can't help with that, but I'm here for your training — what do you need?"
            out_parts.append(refusal)
            yield {"type": "text_delta", "text": refusal}
            yield {"type": "done"}
            return

        async for event in _core_agent_events(clean_text, session_id, user_id, db, channel):
            etype = event.get("type")
            if etype == "usage":
                input_tokens += event.get("input_tokens", 0)
                output_tokens += event.get("output_tokens", 0)
                continue  # internal — never forwarded
            if etype == "text_delta":
                if ttft_ms is None:
                    ttft_ms = timer.peek_ms()
                out_parts.append(event["text"])
            elif etype == "error":
                errored = True
            yield event
    finally:
        latency_ms = timer.peek_ms()
        out_flags = SecurityPipeline.observe_output("".join(out_parts), channel)
        if out_flags.concerns or out_flags.pii_types:
            logger.info(
                "output_flags",
                extra={"extra_data": {
                    "user_id": user_id, "channel": channel,
                    "concerns": out_flags.concerns, "pii": out_flags.pii_types,
                    "sample": out_flags.masked_sample,
                }},
            )
        metrics.record_request(
            latency_ms=latency_ms,
            ttft_ms=ttft_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            error=errored,
        )


async def run_chat_agent(
    user_message: str,
    session_id: str | None,
    user_id: str,
    db: AsyncClient,
) -> AsyncGenerator[str, None]:
    """SSE wrapper around the agent chokepoint for POST /api/chat."""
    async for event in run_agent_turn(user_message, session_id, user_id, db, channel="text"):
        yield f"data: {json.dumps(event)}\n\n"

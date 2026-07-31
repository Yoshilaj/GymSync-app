"""
Session distillation — turns a finished workout into one durable personal memory.

Runs AFTER the response to DELETE /session/{id} has been sent (FastAPI BackgroundTasks):
ending a workout must feel instant, and a summary nobody is waiting for has no business
inside that request.

What it deliberately does NOT store: the numbers. Sets, reps and loads live in
`completed_sets` and are read with SQL, because "what did I bench last week" deserves an
exact answer. What lands in memory is the part SQL can't answer later — how the session
went, what the user said about it, what the coach would want to recall in a month.
"""
import logging

from supabase import AsyncClient

from app.rag import memory

logger = logging.getLogger(__name__)

# Small model on purpose: this is compression, not reasoning, and it runs once per workout.
_SUMMARY_MODEL = "claude-haiku-4-5-20251001"
_MAX_TOKENS = 220

_PROMPT = """Below is one finished workout: the sets the user logged, and what they and \
their coach said during it.

Write 1-3 sentences a coach would want to recall months from now — how the session went, \
anything the user said about how they felt, and anything notable about their effort or \
mood. Write in the third person, past tense, self-contained (no "this session" or "today" \
— name the date if it matters).

Do NOT list the sets, reps or weights back; those are stored separately. If nothing about \
the session was worth remembering beyond the numbers, reply with exactly: SKIP

{body}"""


def _render_sets(rows: list[dict]) -> str:
    by_exercise: dict[str, list[str]] = {}
    for r in rows:
        weight, reps = r.get("weight"), r.get("reps")
        unit = r.get("weight_unit") or ""
        by_exercise.setdefault(r.get("exercise_name") or "?", []).append(
            f"{reps}@{weight:g}{unit}" if weight else str(reps)
        )
    return "\n".join(f"- {name}: {', '.join(sets)}" for name, sets in by_exercise.items())


def _render_chat(history: list) -> str:
    lines = []
    for turn in history[-20:] if isinstance(history, list) else []:
        if not isinstance(turn, dict):
            continue
        role = turn.get("role")
        content = (turn.get("content") or "").strip()
        if content and role in ("user", "assistant"):
            lines.append(f"{'User' if role == 'user' else 'Coach'}: {content}")
    return "\n".join(lines)


async def summarize_session(session_id: str, user_id: str, db: AsyncClient) -> str | None:
    """Distill one session into a `session_summary` memory. Returns the row id, or None.

    Best-effort throughout: this runs detached from any request, so a failure has no one
    to report to beyond the log.
    """
    try:
        sets_res = await (
            db.table("completed_sets")
            .select("exercise_name, reps, weight, weight_unit")
            .eq("session_id", session_id)
            .order("logged_at")
            .execute()
        )
        rows = sets_res.data or []
        if not rows:
            return None  # nothing happened; nothing to remember

        sess_res = await (
            db.table("workout_sessions")
            .select("chat_history, created_at")
            .eq("id", session_id)
            .single()
            .execute()
        )
        session = sess_res.data or {}

        body_parts = [f"Sets logged:\n{_render_sets(rows)}"]
        chat = _render_chat(session.get("chat_history") or [])
        if chat:
            body_parts.append(f"Conversation:\n{chat}")
        occurred_at = session.get("created_at")
        if occurred_at:
            body_parts.insert(0, f"Date: {str(occurred_at)[:10]}")

        from app.agents.core import _get_client

        res = await _get_client().messages.create(
            model=_SUMMARY_MODEL,
            max_tokens=_MAX_TOKENS,
            messages=[{"role": "user", "content": _PROMPT.format(body="\n\n".join(body_parts))}],
        )
        text = "".join(b.text for b in res.content if getattr(b, "type", None) == "text").strip()
        if not text or text.upper().startswith("SKIP"):
            return None

        return await memory.remember(
            user_id, "session_summary", text, db,
            source_id=session_id, occurred_at=occurred_at,
        )
    except Exception:  # noqa: BLE001 — detached background work; log and drop
        logger.warning("session summary failed for %s", session_id, exc_info=True)
        return None

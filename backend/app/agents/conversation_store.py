"""
Persistence for chat-tab conversations (conversations / conversation_messages).

Shared by the agent loop (history load/save) and the WebSocket router
(lazy creation, starter seeding). Every query filters on user_id — the
service-role client bypasses RLS, so the app-layer filter IS the boundary.
"""
import re

from supabase import AsyncClient

from app.agents.tools import utcnow

TITLE_MAX_CHARS = 40
# Replay bounds: enough context for continuity without dragging a long
# thread's full token cost into every turn.
REPLAY_MAX_MESSAGES = 20
REPLAY_CHAR_BUDGET = 8000


def derive_title(text: str) -> str:
    """First user message → list title: whitespace collapsed, hard-truncated."""
    collapsed = re.sub(r"\s+", " ", text).strip()
    if len(collapsed) <= TITLE_MAX_CHARS:
        return collapsed or "New chat"
    return collapsed[:TITLE_MAX_CHARS].rstrip() + "…"


async def create_conversation(user_id: str, title: str, db: AsyncClient) -> dict:
    res = await db.table("conversations").insert(
        {"user_id": user_id, "title": derive_title(title)}
    ).execute()
    return res.data[0]


async def get_conversation(
    conversation_id: str, user_id: str, db: AsyncClient
) -> dict | None:
    """Ownership-checked lookup. limit(1), not single() — single raises on zero rows."""
    res = await db.table("conversations").select("*").eq(
        "id", conversation_id
    ).eq("user_id", user_id).limit(1).execute()
    return res.data[0] if res.data else None


async def add_messages(
    conversation_id: str,
    user_id: str,
    messages: list[dict],
    db: AsyncClient,
) -> None:
    """Append turns ({"role","content"}) and bump the conversation's activity."""
    if not messages:
        return
    await db.table("conversation_messages").insert(
        [
            {
                "conversation_id": conversation_id,
                "user_id": user_id,
                "role": m["role"],
                "content": m["content"],
            }
            for m in messages
        ]
    ).execute()
    await db.table("conversations").update({"updated_at": utcnow()}).eq(
        "id", conversation_id
    ).eq("user_id", user_id).execute()


async def load_recent(
    conversation_id: str,
    db: AsyncClient,
    limit: int = REPLAY_MAX_MESSAGES,
    char_budget: int = REPLAY_CHAR_BUDGET,
) -> list[dict]:
    """
    The last `limit` turns in chronological order, trimmed from the oldest end
    to fit the char budget. Always returns a sequence the Anthropic API accepts:
    the first message must be role "user", so a leading assistant turn (a
    seeded starter, or a trim that cut mid-pair) gets a stub user turn ahead
    of it.
    """
    res = await db.table("conversation_messages").select("role, content").eq(
        "conversation_id", conversation_id
    ).order("id", desc=True).limit(limit).execute()

    rows = list(reversed(res.data or []))

    total = sum(len(r["content"]) for r in rows)
    while rows and total > char_budget:
        total -= len(rows[0]["content"])
        rows.pop(0)

    messages = [{"role": r["role"], "content": r["content"]} for r in rows]
    if messages and messages[0]["role"] == "assistant":
        messages.insert(0, {"role": "user", "content": "(opened the chat)"})
    return messages

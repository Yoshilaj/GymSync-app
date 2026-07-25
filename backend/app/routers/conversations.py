"""
Chat-tab conversation history (list / reopen / delete).

Creation is implicit — the WebSocket makes the row on the first message of a
thread (see voice_ws.py), so this router is read/delete only. The 90-day
retention is enforced both here (read filter) and by the nightly pg_cron
sweep from 006_conversations.sql.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from supabase import AsyncClient

from app.auth import get_current_user_id
from app.database import get_db

router = APIRouter(tags=["conversations"])

RETENTION_DAYS = 90
LIST_LIMIT = 100
THREAD_MESSAGE_CAP = 500  # newest N; pagination hook if threads ever outgrow it


def _retention_cutoff() -> str:
    return (
        datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    ).isoformat()


@router.get("/conversations")
async def list_conversations(
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    res = await db.table("conversations").select(
        "id, title, created_at, updated_at"
    ).eq("user_id", user_id).gte(
        "updated_at", _retention_cutoff()
    ).order("updated_at", desc=True).limit(LIST_LIMIT).execute()
    return {"conversations": res.data or []}


@router.get("/conversations/{conversation_id}")
async def get_conversation_thread(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    convo = await db.table("conversations").select(
        "id, title, created_at, updated_at"
    ).eq("id", conversation_id).eq("user_id", user_id).limit(1).execute()
    if not convo.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Newest cap, then chronological for the client.
    msgs = await db.table("conversation_messages").select(
        "id, role, content, created_at"
    ).eq("conversation_id", conversation_id).eq("user_id", user_id).order(
        "id", desc=True
    ).limit(THREAD_MESSAGE_CAP).execute()

    return {
        "conversation": convo.data[0],
        "messages": list(reversed(msgs.data or [])),
    }


@router.delete("/conversations/{conversation_id}", status_code=200)
async def delete_conversation(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    res = await db.table("conversations").delete().eq(
        "id", conversation_id
    ).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted", "conversation_id": conversation_id}

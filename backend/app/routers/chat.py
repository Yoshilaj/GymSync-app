from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from supabase import AsyncClient

from app.agents.core import run_chat_agent
from app.auth import get_current_user_id
from app.config import settings
from app.database import get_db
from app.models import ChatRequest
from app.ratelimit import limiter

router = APIRouter(tags=["chat"])


@router.post("/chat")
@limiter.limit(settings.rate_limit)  # keyed per user; slowapi needs the `request` param below
async def chat(
    request: Request,
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> StreamingResponse:
    async def event_stream():
        async for chunk in run_chat_agent(body.message, body.session_id, user_id, db):
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx buffering if behind a proxy
        },
    )

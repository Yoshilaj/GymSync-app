"""
WebSocket voice channel — /ws/voice/{user_id}

Text mode  (active always):  send {"type":"message","text":"..."} for text chat with no audio.
Voice mode (opt-in per session): send {"type":"session_start","voice":true} then stream binary PCM.

Client → Server:
  {"type": "session_start", "session_id": "uuid", "voice": true|false}
  {"type": "session_end"}
  {"type": "message", "text": "..."}        ← text chat (voice=false or no session)
  <binary>                                  ← Linear16 PCM 16kHz audio (voice=true)

Server → Client:
  {"type": "transcript",  "text": "..."}   ← STT result (voice mode)
  {"type": "text_delta",  "text": "..."}   ← LLM streaming (text mode)
  {"type": "app_action",  "action": "..."}
  {"type": "done"}
  {"type": "error",       "message": "..."}
  <binary>                                  ← MP3 audio chunks (voice mode)

Auth: ?token=<supabase_jwt> query param.
"""
import json

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.agents.core import run_agent_turn
from app.agents.voice import VoiceSession
from app.database import get_db
from app.ratelimit import ws_rate_check

router = APIRouter(tags=["voice"])


async def _authenticate(token: str, db) -> str | None:
    try:
        res = await db.auth.get_user(token)
        return res.user.id if res.user else None
    except Exception:
        return None


@router.websocket("/ws/voice/{user_id}")
async def voice_ws(
    websocket: WebSocket,
    user_id: str,
    token: str = Query(..., description="Supabase JWT"),
) -> None:
    db = await get_db()

    authenticated_id = await _authenticate(token, db)
    if authenticated_id != user_id:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    session_id: str | None = None
    voice_session: VoiceSession | None = None

    try:
        while True:
            raw = await websocket.receive()

            if raw.get("type") == "websocket.disconnect":
                break

            # ── Binary frame: raw PCM audio from microphone ───────────────────
            if "bytes" in raw:
                if voice_session:
                    await voice_session.feed_audio(raw["bytes"])
                continue

            if "text" not in raw:
                continue

            try:
                data = json.loads(raw["text"])
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = data.get("type")

            # ── session_start ─────────────────────────────────────────────────
            if msg_type == "session_start":
                session_id = data.get("session_id")
                voice_enabled = data.get("voice", False)

                # Tear down any existing voice session first.
                if voice_session:
                    await voice_session.stop()
                    voice_session = None

                if voice_enabled:
                    voice_session = VoiceSession(websocket, user_id, session_id, db)
                    await voice_session.start()

                await websocket.send_json({
                    "type": "ack",
                    "session_id": session_id,
                    "voice": voice_enabled,
                })

            # ── session_end ───────────────────────────────────────────────────
            elif msg_type == "session_end":
                if voice_session:
                    await voice_session.stop()
                    voice_session = None
                session_id = None
                await websocket.send_json({"type": "ack"})

            # ── text message (non-voice chat over WebSocket) ──────────────────
            elif msg_type == "message":
                text = data.get("text", "").strip()
                if not text:
                    continue
                if not ws_rate_check(user_id):
                    await websocket.send_json(
                        {"type": "error", "message": "Rate limit exceeded. Slow down a moment."}
                    )
                    continue
                async for event in run_agent_turn(
                    text, session_id, user_id, db, channel="text"
                ):
                    await websocket.send_json(event)

            else:
                await websocket.send_json({"type": "error", "message": f"Unknown type: {msg_type}"})

    except WebSocketDisconnect:
        pass
    finally:
        if voice_session:
            await voice_session.stop()

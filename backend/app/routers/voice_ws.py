"""
WebSocket voice channel — /ws/voice/{user_id}

Text mode  (active always):  send {"type":"message","text":"..."} for text chat with no audio.
Voice mode (opt-in per session): send {"type":"session_start","voice":true} then stream binary PCM.

Client → Server:
  {"type": "session_start", "session_id": "uuid", "voice": true|false,
   "conversation_id": "uuid"|null,          ← optional; PRESENCE of the key opts the
                                              socket into chat-tab conversation
                                              persistence (null = create lazily on
                                              the first message)
   "starter_message": "..."}                ← optional bot-initiated opener, persisted
                                              as the conversation's first assistant turn
  {"type": "session_end"}
  {"type": "message", "text": "..."}        ← text chat (voice=false or no session)
  {"type": "keepalive"}                     ← client VAD gate closed; keeps the idle
                                              Deepgram socket warm (voice mode)
  <binary>                                  ← Linear16 PCM 16kHz audio (voice=true)

Server → Client:
  {"type": "ack", "session_id": ..., "voice": ..., "conversation_id": ...}
  {"type": "conversation_created", "conversation_id": "uuid", "title": "..."}
                                            ← once, before the first text_delta, when a
                                              conversation is lazily created
  {"type": "transcript",  "text": "..."}   ← STT result (voice mode)
  {"type": "text_delta",  "text": "..."}   ← LLM streaming (text mode); in voice mode
                                              only as the TTS-failure text fallback
  {"type": "app_action",  "action": "..."}
  {"type": "done"}
  {"type": "error", "message": "...", "fatal": bool}
                                            ← fatal:false = per-turn failure, always
                                              followed by "done" (session continues);
                                              fatal:true = session dead, socket closes
  <binary>                                  ← MP3 audio chunks (voice mode)

Auth: ?token=<supabase_jwt> query param.
"""
import json

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.agents import conversation_store
from app.agents.core import _agent_events
from app.agents.voice import VoiceSession
from app.database import get_db

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
    # Chat-tab conversation persistence — active only when session_start carries
    # a conversation_id key (existing workout/voice clients omit it entirely).
    conversation_mode = False
    conversation_id: str | None = None
    pending_starter: str | None = None

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

                conversation_mode = "conversation_id" in data
                conversation_id = data.get("conversation_id")
                pending_starter = data.get("starter_message")

                if conversation_mode and conversation_id:
                    # Resuming: the id must belong to this user.
                    convo = await conversation_store.get_conversation(
                        conversation_id, user_id, db
                    )
                    if convo is None:
                        conversation_id = None
                        await websocket.send_json({
                            "type": "error",
                            "message": "Conversation not found",
                        })
                    elif pending_starter:
                        # Opener aimed at an existing thread persists right away.
                        await conversation_store.add_messages(
                            conversation_id,
                            user_id,
                            [{"role": "assistant", "content": pending_starter}],
                            db,
                        )
                        pending_starter = None

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
                    "conversation_id": conversation_id,
                })

            # ── keepalive (client VAD gate closed, no audio flowing) ──────────
            elif msg_type == "keepalive":
                if voice_session:
                    await voice_session.keepalive()

            # ── session_end ───────────────────────────────────────────────────
            elif msg_type == "session_end":
                if voice_session:
                    await voice_session.stop()
                    voice_session = None
                session_id = None
                conversation_mode = False
                conversation_id = None
                pending_starter = None
                await websocket.send_json({"type": "ack"})

            # ── text message (non-voice chat over WebSocket) ──────────────────
            elif msg_type == "message":
                text = data.get("text", "").strip()
                if not text:
                    continue

                # First message of a fresh chat-tab thread: create the
                # conversation now (never earlier — an abandoned starter tap
                # must leave no orphan row), seed the opener, tell the client.
                if conversation_mode and conversation_id is None:
                    convo = await conversation_store.create_conversation(
                        user_id, text, db
                    )
                    conversation_id = convo["id"]
                    if pending_starter:
                        await conversation_store.add_messages(
                            conversation_id,
                            user_id,
                            [{"role": "assistant", "content": pending_starter}],
                            db,
                        )
                        pending_starter = None
                    await websocket.send_json({
                        "type": "conversation_created",
                        "conversation_id": conversation_id,
                        "title": convo["title"],
                    })

                async for event in _agent_events(
                    text, session_id, user_id, db, conversation_id=conversation_id
                ):
                    await websocket.send_json(event)

            else:
                await websocket.send_json({"type": "error", "message": f"Unknown type: {msg_type}"})

    except WebSocketDisconnect:
        pass
    finally:
        if voice_session:
            await voice_session.stop()

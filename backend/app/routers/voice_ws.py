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
  {"type": "utterance_end"}                 ← client VAD gate closed AFTER speech;
                                              forces Deepgram to finalize the
                                              buffered transcript now
  {"type": "barge_in"}                      ← user spoke over the coach; abandon
                                              the in-flight turn (client already
                                              stopped playback)
  {"type": "timer_done"}                    ← client rest timer hit zero; server
                                              speaks a short canned cue
  <binary>                                  ← Linear16 PCM 16kHz audio (voice=true)

Server → Client:
  {"type": "ack", "session_id": ..., "voice": ..., "conversation_id": ...}
  {"type": "conversation_created", "conversation_id": "uuid", "title": "..."}
                                            ← once, before the first text_delta, when a
                                              conversation is lazily created
  {"type": "transcript",  "text": "..."}   ← STT result (voice mode)
  {"type": "coach_announce"}                ← unsolicited coach speech (rest-timer
                                              cue) follows as binary MP3 +
                                              segment_end + done
  {"type": "text_delta",  "text": "..."}   ← LLM streaming (text mode); in voice mode
                                              only as the TTS-failure text fallback
  {"type": "app_action",  "action": "..."}
  {"type": "segment_end"}                   ← voice mode: the binary MP3 chunks sent
                                              since the last segment_end form one
                                              complete, independently playable MP3
                                              (the ack, or one sentence). Client
                                              plays it immediately — no waiting
                                              for "done"
  {"type": "done"}
  {"type": "error", "message": "...", "fatal": bool}
                                            ← fatal:false = per-turn failure, always
                                              followed by "done" (session continues);
                                              fatal:true = session dead, socket closes
  {"type": "upgrade_required", "code": ..., "feature": ..., "required_tier": ...,
   "current_tier": ..., "message": ..., "limit"?: n, "used"?: n, "resets_at"?: iso}
                                            ← a paid feature was refused. NOT an
                                              error: the socket stays open and the
                                              client opens the paywall
  <binary>                                  ← MP3 audio chunks (voice mode)

Auth: `Sec-WebSocket-Protocol: bearer, <supabase_jwt>` on the handshake, verified
locally (app/jwt_verify.py). The old `?token=` query param still works but is
deprecated — query strings land in proxy access logs verbatim.
"""
import json

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.agents import conversation_store
from app.agents.core import _agent_events
from app.agents.voice import VoiceSession
from app.database import get_db
from app.jwt_verify import TokenInvalid, VerifierUnavailable, verify_access_token
from app.session_store import owns_session
from app.entitlements import (
    CHAT_MESSAGE,
    VOICE_SESSION,
    QuotaExceeded,
    check_quota,
    consume_quota,
)

router = APIRouter(tags=["voice"])


async def _refuse(websocket: WebSocket, exc: QuotaExceeded) -> None:
    """
    Tell the client a paid feature is unavailable, and keep the socket open.

    Deliberately NOT a close, and NOT {"type":"error"}. This socket is shared:
    voice mode and text chat both ride it, so closing over a voice quota would
    also kill chat. And the client auto-retries every close code except 4001
    (useVoiceSession.ts), so a quota close would be retried and then surface as
    a generic "Connection closed" — the customer would never learn they need to
    upgrade.
    """
    await websocket.send_json({"type": "upgrade_required", **exc.detail()})


async def _authenticate(token: str) -> str | None:
    """Local signature check — same verifier the HTTP routes use (app/jwt_verify.py).

    Returns None for both "bad token" and "verifier down". A WebSocket has no status
    code to differentiate them with, and the client already treats 4001 as terminal,
    so collapsing them here is correct; the HTTP surface is where the 401/503
    distinction actually matters.
    """
    try:
        claims = await verify_access_token(token)
        return claims.sub
    except (TokenInvalid, VerifierUnavailable):
        return None


def _token_from_handshake(websocket: WebSocket) -> tuple[str | None, str | None]:
    """Pull the bearer token out of `Sec-WebSocket-Protocol: bearer, <jwt>`.

    Returns (token, subprotocol_to_echo). RFC 6455 requires the server to echo one of
    the offered subprotocols, or the client may abort the connection — so when we
    accept the token this way we must accept() with "bearer".
    """
    offered = websocket.headers.get("sec-websocket-protocol")
    if not offered:
        return None, None
    parts = [p.strip() for p in offered.split(",") if p.strip()]
    if len(parts) >= 2 and parts[0] == "bearer":
        return parts[1], "bearer"
    return None, None


@router.websocket("/ws/voice/{user_id}")
async def voice_ws(
    websocket: WebSocket,
    user_id: str,
    # DEPRECATED fallback. The token belongs in the handshake, not the URL — query
    # strings are logged verbatim by proxies. Kept optional so the mock-voice tooling
    # and any client build predating the switch still connect.
    token: str | None = Query(default=None, description="DEPRECATED: use Sec-WebSocket-Protocol"),
) -> None:
    db = await get_db()

    header_token, subprotocol = _token_from_handshake(websocket)
    presented = header_token or token

    # Accept FIRST, then close with 4001 on a bad token. Closing before accept
    # rejects the HTTP handshake outright, and the client then sees code 1006
    # ("abnormal closure") — indistinguishable from a dropped network. It would
    # retry a token that will never work and finally report "Connection closed".
    # useVoiceSession.ts treats 4001 as terminal precisely so it can say
    # "Authentication rejected" instead, and it only ever receives that code if
    # the handshake completed. Nothing is exchanged before the check below.
    await websocket.accept(subprotocol=subprotocol)

    authenticated_id = await _authenticate(presented) if presented else None
    if authenticated_id != user_id:
        await websocket.close(code=4001)
        return

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

                if session_id and not await owns_session(session_id, user_id, db):
                    # Same rule as conversation_id below: an id off the wire must
                    # belong to this user. Everything downstream — _load_history and
                    # every agent tool reading ctx.session_id — trusts this check and
                    # queries the row by id alone, so it is the only thing standing
                    # between a guessed uuid and another user's workout and chat log.
                    # Drop to a free-form session rather than closing the socket; the
                    # client already handles a session-less turn.
                    session_id = None
                    await websocket.send_json({
                        "type": "error",
                        "message": "Session not found",
                    })

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
                    # Live voice coaching is the paid capability. Gated on
                    # voice_enabled rather than on connect, because a text-chat
                    # client opens this same socket with voice:false and must
                    # not be charged against a voice allowance.
                    #
                    # The allowance is consumed here, at the point Deepgram and
                    # TTS actually start costing money — but only ONCE per
                    # workout session. The client reconnects the socket freely
                    # (gym wifi drops, foreground/background, the auto-retry),
                    # and each reconnect replays session_start; metering per
                    # frame let two flaky workouts burn a Pro user's whole
                    # month. The session row remembers it already paid.
                    already_consumed = False
                    if session_id:
                        paid = await db.table("workout_sessions").select(
                            "session_data"
                        ).eq("id", session_id).execute()
                        if paid.data:
                            already_consumed = bool(
                                (paid.data[0].get("session_data") or {}).get("voice_consumed")
                            )
                    if already_consumed:
                        voice_session = VoiceSession(websocket, user_id, session_id, db)
                        await voice_session.start()
                    else:
                        try:
                            await check_quota(VOICE_SESSION, user_id, db)
                        except QuotaExceeded as exc:
                            await _refuse(websocket, exc)
                            voice_enabled = False
                        else:
                            voice_session = VoiceSession(websocket, user_id, session_id, db)
                            await voice_session.start()
                            await consume_quota(VOICE_SESSION, user_id, db)
                            if session_id:
                                # Read-modify-write is fine here: one socket per
                                # session in practice, and a lost race merely
                                # meters one extra start — the pre-fix behavior.
                                current = (paid.data[0].get("session_data") or {}) if paid.data else {}
                                await db.table("workout_sessions").update(
                                    {"session_data": {**current, "voice_consumed": True}}
                                ).eq("id", session_id).eq("user_id", user_id).execute()

                await websocket.send_json({
                    "type": "ack",
                    "session_id": session_id,
                    # Reports what the client actually GOT. A refused voice
                    # session acks voice:false, so the UI never renders a
                    # listening state for a session that isn't running.
                    "voice": voice_enabled,
                    "conversation_id": conversation_id,
                })

            # ── keepalive (client VAD gate closed, no audio flowing) ──────────
            elif msg_type == "keepalive":
                if voice_session:
                    await voice_session.keepalive()

            # ── utterance_end (client gate closed after speech → flush STT) ───
            elif msg_type == "utterance_end":
                if voice_session:
                    await voice_session.finalize_utterance()

            # ── barge_in (user spoke over the coach → abandon the turn) ───────
            elif msg_type == "barge_in":
                if voice_session:
                    voice_session.request_cancel()

            # ── timer_done (rest over → speak a canned cue) ───────────────────
            elif msg_type == "timer_done":
                if voice_session:
                    await voice_session.announce_timer_done()

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

                # Free tier's "Limited messages". Checked BEFORE the
                # conversation is lazily created below, so a refused message
                # leaves no empty thread behind in the chat list.
                try:
                    await check_quota(CHAT_MESSAGE, user_id, db)
                except QuotaExceeded as exc:
                    await _refuse(websocket, exc)
                    # The client's turn state machine waits for "done" to
                    # release the composer; without it the input stays locked.
                    await websocket.send_json({"type": "done"})
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

                # Counted only after the turn ran. A message that failed on our
                # side (model error, dropped connection) must not burn one of a
                # free user's ten.
                await consume_quota(CHAT_MESSAGE, user_id, db)

            else:
                await websocket.send_json({"type": "error", "message": f"Unknown type: {msg_type}"})

    except WebSocketDisconnect:
        pass
    finally:
        if voice_session:
            await voice_session.stop()

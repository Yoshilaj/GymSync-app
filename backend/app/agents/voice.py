"""
Voice pipeline: Deepgram Nova-3 STT → agent → ElevenLabs Flash TTS

Audio format contract (must match mobile client):
  Input  (client → server): Linear16 PCM, 16 kHz, mono, binary WebSocket frames
  Output (server → client): MP3 128kbps binary WebSocket frames (easy to play in React Native)

Latency target: ~1 s from speech_final to first audio byte back.
"""
import asyncio
import re
from collections.abc import AsyncGenerator

import httpx
from deepgram import DeepgramClient, LiveOptions, LiveTranscriptionEvents

from app.agents.core import run_agent_turn
from app.agents.personalities import get_voice_id
from app.config import settings
from app.ratelimit import ws_rate_check

# Match sentence boundaries: split after . ! ? followed by whitespace.
_SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
# Fallback: flush TTS buffer if it grows beyond this without a sentence end.
_MAX_BUFFER_CHARS = 200


def _pop_sentences(text: str) -> tuple[list[str], str]:
    """Return (complete_sentences, remainder)."""
    parts = _SENTENCE_RE.split(text)
    if len(parts) > 1:
        return parts[:-1], parts[-1]
    if len(text) >= _MAX_BUFFER_CHARS:
        return [text], ""
    return [], text


async def elevenlabs_tts_stream(text: str, voice_id: str) -> AsyncGenerator[bytes, None]:
    """Stream MP3 audio from ElevenLabs Flash for a given text snippet."""
    async with httpx.AsyncClient(timeout=30.0) as http:
        async with http.stream(
            "POST",
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream",
            headers={
                "xi-api-key": settings.elevenlabs_api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": "eleven_flash_v2_5",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                    "use_speaker_boost": True,
                },
                "output_format": "mp3_44100_128",
            },
        ) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes(chunk_size=4096):
                if chunk:
                    yield chunk


async def _get_voice_id_for_user(user_id: str, db) -> str:
    res = await db.table("personalities").select("preset_id").eq("user_id", user_id).execute()
    preset_id = res.data[0]["preset_id"] if res.data else "supportive"
    return get_voice_id(preset_id)


class VoiceSession:
    """
    Manages one live voice session per WebSocket connection.

    Binary audio in  → Deepgram STT → agent (run_agent_turn) → ElevenLabs TTS → binary audio out
    JSON frames out  ← app_action / transcript / done packets
    """

    def __init__(self, websocket, user_id: str, session_id: str | None, db):
        self._ws = websocket
        self._user_id = user_id
        self._session_id = session_id
        self._db = db
        self._dg = None
        self._transcript_q: asyncio.Queue[str | None] = asyncio.Queue()
        self._processor_task: asyncio.Task | None = None
        # Single lock prevents interleaved sends from the main loop and the processor task.
        self._ws_lock = asyncio.Lock()
        # Drop incoming transcripts while the agent is already responding.
        self._busy = False

    async def start(self) -> None:
        """Open Deepgram connection and start the transcript processor."""
        dg_client = DeepgramClient(api_key=settings.deepgram_api_key)
        self._dg = dg_client.listen.asyncwebsocket.v("1")

        # Capture outer self via closure — self_dg is the Deepgram client arg.
        outer = self

        async def _on_transcript(self_dg, result, **kwargs):
            # speech_final = Deepgram VAD detected end of utterance (endpointing).
            if result.speech_final:
                text = result.channel.alternatives[0].transcript.strip()
                if text:
                    await outer._transcript_q.put(text)

        self._dg.on(LiveTranscriptionEvents.Transcript, _on_transcript)

        options = LiveOptions(
            model="nova-3",
            encoding="linear16",
            sample_rate=16000,
            channels=1,
            endpointing=300,   # ms of silence → speech_final
            smart_format=True,
        )
        await self._dg.start(options)
        self._processor_task = asyncio.create_task(self._process_transcripts())

    async def feed_audio(self, chunk: bytes) -> None:
        """Forward a raw PCM chunk from the client to Deepgram."""
        if self._dg:
            await self._dg.send(chunk)

    async def stop(self) -> None:
        """Tear down the Deepgram connection and wait for the processor to finish."""
        await self._transcript_q.put(None)   # sentinel to stop processor loop
        if self._dg:
            await self._dg.finish()
        if self._processor_task:
            try:
                await asyncio.wait_for(self._processor_task, timeout=5.0)
            except asyncio.TimeoutError:
                self._processor_task.cancel()

    # ── Internal ──────────────────────────────────────────────────────────────

    async def _process_transcripts(self) -> None:
        while True:
            transcript = await self._transcript_q.get()
            if transcript is None:
                break
            if self._busy:
                continue   # agent already responding — drop the overlapping utterance
            self._busy = True
            try:
                await self._handle_utterance(transcript)
            except Exception as exc:
                async with self._ws_lock:
                    await self._ws.send_json({"type": "error", "message": str(exc)})
            finally:
                self._busy = False

    async def _handle_utterance(self, transcript: str) -> None:
        async with self._ws_lock:
            await self._ws.send_json({"type": "transcript", "text": transcript})

        if not ws_rate_check(self._user_id):
            async with self._ws_lock:
                await self._ws.send_json(
                    {"type": "error", "message": "Rate limit exceeded. Slow down a moment."}
                )
            return

        voice_id = await _get_voice_id_for_user(self._user_id, self._db)
        tts_buffer = ""

        async for event in run_agent_turn(
            transcript, self._session_id, self._user_id, self._db, channel="voice"
        ):
            if event["type"] == "text_delta":
                tts_buffer += event["text"]
                sentences, tts_buffer = _pop_sentences(tts_buffer)
                for sentence in sentences:
                    if sentence.strip():
                        await self._tts_and_send(sentence, voice_id)

            elif event["type"] in ("app_action", "error"):
                async with self._ws_lock:
                    await self._ws.send_json(event)

            elif event["type"] == "done":
                if tts_buffer.strip():
                    await self._tts_and_send(tts_buffer, voice_id)
                async with self._ws_lock:
                    await self._ws.send_json({"type": "done"})

    async def _tts_and_send(self, text: str, voice_id: str) -> None:
        async for chunk in elevenlabs_tts_stream(text, voice_id):
            async with self._ws_lock:
                await self._ws.send_bytes(chunk)

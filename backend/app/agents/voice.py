"""
Voice pipeline: Deepgram Nova-3 STT → agent → TTS (Aura / ElevenLabs, see tts.py)

Audio format contract (must match mobile client):
  Input  (client → server): Linear16 PCM, 16 kHz, mono, binary WebSocket frames
  Output (server → client): MP3 binary WebSocket frames (easy to play in React Native)

Latency target: ~1 s from speech_final to first audio byte back.

Degradation contract: if every TTS provider fails, the turn does not die —
the client gets one non-fatal {"type": "error"} and the rest of the reply as
text_delta frames, and the turn still ends with {"type": "done"}.
"""
import asyncio
import logging
import random
import re

from deepgram import (
    DeepgramClient,
    DeepgramClientOptions,
    LiveOptions,
    LiveTranscriptionEvents,
)

from app.agents.core import _agent_events
from app.agents.tts import TTSError, synthesize
from app.config import settings

logger = logging.getLogger(__name__)

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


# ── Speech sanitation ────────────────────────────────────────────────────────
# The agent writes for two surfaces: the chat UI, where markdown renders, and
# TTS, where markdown is read aloud ("**bench press**" → "star star bench
# press"). Sanitize deterministically on the TTS path only — the text_delta
# fallback keeps the raw text for the client to render. Order matters: bullets
# before emphasis (so "* item" isn't parsed as italics), ranged "3x8-12"
# before plain "5x5".
_SANITIZE_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"```[\s\S]*?```"), " "),                     # fenced code blocks
    (re.compile(r"^```.*$", re.MULTILINE), ""),               # stray fence line
    (re.compile(r"^\s{0,3}#{1,6}\s+", re.MULTILINE), ""),     # headers
    (re.compile(r"^\s*>\s?", re.MULTILINE), ""),              # blockquotes
    (re.compile(r"^\s*[-*•]\s+", re.MULTILINE), ""),          # bullet markers
    (re.compile(r"\[([^\]]+)\]\([^)]*\)"), r"\1"),            # [label](url) → label
    (re.compile(r"https?://\S+"), ""),                        # bare URLs
    (re.compile(r"`([^`]*)`"), r"\1"),                        # inline code
    (re.compile(r"\*{1,3}([^*\n]+)\*{1,3}"), r"\1"),          # *em* / **bold**
    (re.compile(r"__([^_\n]+)__"), r"\1"),                    # __bold__ (single _ kept)
    (re.compile(r"\b(\d+)\s*[xX×]\s*(\d+)\s*[-–]\s*(\d+)\b"), r"\1 by \2 to \3"),
    (re.compile(r"\b(\d+)\s*[xX×]\s*(\d+)\b"), r"\1 by \2"),
    (re.compile(r"\b(\d+)\s*[-–]\s*(\d+)(?=\s*(?:reps?|sets?)\b)"), r"\1 to \2"),
    # Emoji and pictographs: Aura vocalizes their Unicode names — a trailing 💪
    # becomes the spoken word "muscle". Covers arrows, misc symbols/dingbats,
    # the supplemental emoji planes, variation selectors, and ZWJ sequences.
    (
        re.compile(
            "["
            "←-⇿"  # arrows
            "⌀-➿"  # misc technical, symbols, dingbats
            "⬀-⯿"  # misc symbols and arrows
            "〰〽㊗㊙"  # CJK symbols used as emoji
            "︎️"  # variation selectors
            "‍"  # zero-width joiner
            "\U0001f000-\U0001faff"  # emoji planes (incl. 💪 U+1F4AA)
            "]+"
        ),
        " ",
    ),
]


def _sanitize_for_speech(text: str) -> str:
    """Markdown/notation → plain speakable text. May return "" (pure-markdown
    input) — callers skip TTS entirely in that case."""
    for pattern, repl in _SANITIZE_RULES:
        text = pattern.sub(repl, text)
    return re.sub(r"\s+", " ", text).strip()


# ── Instant acknowledgments ──────────────────────────────────────────────────
# Played as the first audio segment of every turn, before the agent runs, so
# the user hears they were heard (~0s vs the full think+TTS latency). Audio
# only — never a text_delta, never in history. Long enough (~2-3s spoken) to
# cover most of the think+first-TTS gap, but generic: they play before the
# agent knows anything, so they must not promise specifics.
_ACK_PHRASES: dict[str, list[str]] = {
    "classic": [
        "Got it — give me one second to look at where you're at.",
        "Understood. Let me think that through for a moment.",
        "Okay, noted. One moment while I check your session.",
        "On it — let me pull that up real quick.",
    ],
    "supportive": [
        "Got it! Give me just a second to look at where you're at.",
        "Okay! Let me think about the best way to handle that for you.",
        "I hear you — one sec while I check your session.",
        "Sure thing! Let me take a quick look here.",
    ],
    "energetic": [
        "LET'S GO — gimme one second to line this up!",
        "On it! Hang tight one sec while I check your numbers!",
        "Heard! Let me pull up where you're at real quick!",
        "Boom! One second, lining up your next move!",
    ],
}
# Spoken when the client reports its rest timer hit zero — same contract as
# acks: canned, cached, audio-only, best-effort. Never a full agent turn.
_TIMER_PHRASES: dict[str, list[str]] = {
    "classic": [
        "Rest's up — back to it.",
        "Time. Next set whenever you're ready.",
        "That's your rest — let's continue.",
    ],
    "supportive": [
        "Time's up! Ready when you are.",
        "Rest's done — you've got this next one.",
        "Okay, break's over — back to it when you're set!",
    ],
    "energetic": [
        "REST'S OVER — LET'S GO!",
        "TIME! Back on it!",
        "Break's DONE — hit it!",
    ],
}

# (preset_id, phrase) → MP3 bytes, cached for the process lifetime (~20KB each).
# Benign race if two sessions warm the same key concurrently — last write wins.
_phrase_cache: dict[tuple[str, str], bytes] = {}


async def _cached_phrase_audio(preset_id: str, phrase: str) -> bytes | None:
    key = (preset_id, phrase)
    if key not in _phrase_cache:
        try:
            _phrase_cache[key] = b"".join(
                [c async for c in synthesize(phrase, preset_id)]
            )
        except Exception:  # incl. TTSError — canned phrases are best-effort
            logger.warning("phrase synthesis failed for %s", key, exc_info=True)
            return None
    return _phrase_cache[key]


class UtteranceAggregator:
    """Accumulates Deepgram `is_final` fragments until an utterance boundary.

    Deepgram advances endpointing/UtteranceEnd on AUDIO time, and the client
    gate stops sending frames the moment it closes — so a short utterance can
    sit in Deepgram's buffer with no boundary ever firing. Fragments collect
    here and are released by whichever boundary arrives first: speech_final,
    a Finalize response (from_finalize), UtteranceEnd, or the post-Finalize
    force-flush.
    """

    def __init__(self) -> None:
        self._parts: list[str] = []
        # Bumped on every flush — lets a delayed force-flush detect that a
        # real boundary already handled the utterance.
        self.generation = 0

    def add_final(self, text: str) -> None:
        text = text.strip()
        if text:
            self._parts.append(text)

    def flush(self) -> str | None:
        self.generation += 1
        if not self._parts:
            return None
        text = " ".join(self._parts)
        self._parts.clear()
        return text


class VoiceSession:
    """
    Manages one live voice session per WebSocket connection.

    Binary audio in  → Deepgram STT → agent (_agent_events) → TTS → binary audio out
    JSON frames out  ← app_action / transcript / error / done packets
    """

    def __init__(self, websocket, user_id: str, session_id: str | None, db):
        self._ws = websocket
        self._user_id = user_id
        self._session_id = session_id
        self._db = db
        self._dg = None
        # Tagged commands: ("utterance", text) | ("timer_done", None) | None sentinel.
        self._transcript_q: asyncio.Queue[tuple[str, str | None] | None] = asyncio.Queue()
        self._processor_task: asyncio.Task | None = None
        # Single lock prevents interleaved sends from the main loop and the processor task.
        self._ws_lock = asyncio.Lock()
        # True while a turn is in flight — gates barge-in cancellation.
        self._busy = False
        # Set by the client's barge_in message; checked throughout the turn.
        self._cancel_turn = asyncio.Event()
        # is_final fragments waiting for an utterance boundary.
        self._agg = UtteranceAggregator()
        # Collapse stacked timer_done requests into one queued announcement.
        self._timer_queued = False
        # Strong refs to fire-and-forget tasks (the loop only keeps weak ones).
        self._bg_tasks: set[asyncio.Task] = set()
        # Deepgram lifecycle: _stopping silences the Close handler during a
        # deliberate teardown; the other two bound recovery to one restart.
        self._stopping = False
        self._dg_recovering = False
        self._dg_restarted = False
        # Preset cached per session (one DB query, not one per utterance); a
        # mid-session personality switch takes effect on the next connect.
        self._preset_id: str | None = None
        self._ack_warm_task: asyncio.Task | None = None

    async def start(self) -> None:
        """Open Deepgram connection and start the transcript processor."""
        await self._open_deepgram()
        self._processor_task = asyncio.create_task(self._process_transcripts())
        # Warm the ack audio in the background so the first turn's ack is a
        # cache hit instead of a live TTS call.
        self._preset_id = await self._get_preset_id()
        self._ack_warm_task = asyncio.create_task(self._prewarm_acks())

    async def feed_audio(self, chunk: bytes) -> None:
        """Forward a raw PCM chunk from the client to Deepgram."""
        if self._dg is None or self._stopping:
            return
        # send() returns False (never raises) once the socket is closed;
        # the Close handler owns recovery, so a dropped chunk here is fine.
        await self._dg.send(chunk)

    async def keepalive(self) -> None:
        """Client-side VAD gate is closed — keep the idle Deepgram socket warm."""
        if self._dg and not self._stopping:
            await self._dg.keep_alive()

    async def finalize_utterance(self) -> None:
        """Client VAD gate closed after speech: force Deepgram to flush NOW.

        Gate close stops audio frames, and Deepgram's endpointing runs on audio
        time — without this nudge a short utterance ("65 kg") can sit in its
        buffer indefinitely. Finalize makes Deepgram emit the buffered
        transcript with from_finalize set; a delayed force-flush covers a lost
        Finalize response.
        """
        if self._dg is None or self._stopping:
            return
        gen_at_request = self._agg.generation
        try:
            finalize = getattr(self._dg, "finalize", None)
            if finalize is not None:
                await finalize()
        except Exception:
            logger.warning("Deepgram finalize failed", exc_info=True)

        async def _force_flush() -> None:
            await asyncio.sleep(2.0)
            # Only if no boundary flushed since we asked.
            if self._agg.generation == gen_at_request:
                text = self._agg.flush()
                if text:
                    await self._transcript_q.put(("utterance", text))

        task = asyncio.create_task(_force_flush())
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)

    def request_cancel(self) -> None:
        """Client barge-in: abandon the in-flight turn (no-op between turns —
        the client already stopped playback and went back to listening)."""
        if self._busy:
            self._cancel_turn.set()

    async def announce_timer_done(self) -> None:
        """Client rest timer hit zero — queue a spoken cue. Ordered behind any
        in-flight turn by the queue; stacked requests collapse into one."""
        if self._timer_queued:
            return
        self._timer_queued = True
        await self._transcript_q.put(("timer_done", None))

    async def stop(self) -> None:
        """Tear down the Deepgram connection and wait for the processor to finish."""
        self._stopping = True
        if self._ack_warm_task and not self._ack_warm_task.done():
            self._ack_warm_task.cancel()
        await self._transcript_q.put(None)   # sentinel to stop processor loop
        if self._dg:
            await self._dg.finish()
        if self._processor_task:
            try:
                await asyncio.wait_for(self._processor_task, timeout=5.0)
            except asyncio.TimeoutError:
                self._processor_task.cancel()

    # ── Deepgram connection ──────────────────────────────────────────────────

    async def _open_deepgram(self) -> None:
        # keepalive: the SDK sends {"type":"KeepAlive"} every 5s so Deepgram
        # doesn't close the socket (1011 net0001) while the user is silent.
        dg_client = DeepgramClient(
            api_key=settings.deepgram_api_key,
            config=DeepgramClientOptions(options={"keepalive": "true"}),
        )
        self._dg = dg_client.listen.asyncwebsocket.v("1")

        # Capture outer self via closure — self_dg is the Deepgram client arg.
        outer = self

        async def _on_transcript(self_dg, result, **kwargs):
            # interim_results=True: everything lands here, but only is_final
            # fragments accumulate. An utterance boundary — speech_final from
            # endpointing, or from_finalize answering our Finalize — releases
            # the joined transcript.
            if not getattr(result, "is_final", False):
                return
            outer._agg.add_final(result.channel.alternatives[0].transcript)
            if result.speech_final or getattr(result, "from_finalize", False):
                text = outer._agg.flush()
                if text:
                    await outer._transcript_q.put(("utterance", text))

        async def _on_utterance_end(self_dg, utterance_end, **kwargs):
            # Safety net for utterances Deepgram never marks speech_final
            # (noisy gyms): fires after utterance_end_ms of audio-time silence.
            text = outer._agg.flush()
            if text:
                await outer._transcript_q.put(("utterance", text))

        async def _on_error(self_dg, error, **kwargs):
            logger.warning("Deepgram error: %s", error)
            await outer._on_dg_dead()

        async def _on_close(self_dg, close, **kwargs):
            await outer._on_dg_dead()

        self._dg.on(LiveTranscriptionEvents.Transcript, _on_transcript)
        self._dg.on(LiveTranscriptionEvents.UtteranceEnd, _on_utterance_end)
        self._dg.on(LiveTranscriptionEvents.Error, _on_error)
        self._dg.on(LiveTranscriptionEvents.Close, _on_close)

        # End-of-turn authority is the CLIENT's VAD gate: its utterance_end
        # message triggers a Deepgram Finalize (finalize_utterance below).
        # endpointing is deliberately slow — a fallback for passthrough mode
        # (no client VAD) — so it stops cutting users off mid-sentence pause.
        options = LiveOptions(
            model="nova-3",
            encoding="linear16",
            sample_rate=16000,
            channels=1,
            interim_results=True,      # required for UtteranceEnd + Finalize flow
            utterance_end_ms="1000",   # audio-time silence → UtteranceEnd safety net
            endpointing=800,           # slow fallback, no longer the authority
            smart_format=True,
        )
        if not await self._dg.start(options):
            raise ConnectionError("Deepgram live connection failed to start")

    async def _on_dg_dead(self) -> None:
        """Deepgram closed/errored underneath us: one transparent restart, then fatal."""
        if self._stopping or self._dg_recovering:
            return
        self._dg_recovering = True
        try:
            if self._dg_restarted:
                await self._fail_fatal("Speech recognition dropped.")
                return
            self._dg_restarted = True
            logger.info("Deepgram connection died — restarting")
            try:
                await self._open_deepgram()
                logger.info("Deepgram restarted transparently")
            except Exception as exc:
                logger.error("Deepgram restart failed: %s", exc)
                await self._fail_fatal("Speech recognition dropped.")
        finally:
            self._dg_recovering = False

    async def _fail_fatal(self, message: str) -> None:
        """Tell the client the session is dead and close; it reconnects fresh."""
        try:
            async with self._ws_lock:
                await self._ws.send_json(
                    {"type": "error", "message": message, "fatal": True}
                )
            await self._ws.close(code=1011)
        except Exception:
            pass  # client may already be gone

    # ── Turn processing ──────────────────────────────────────────────────────

    async def _get_preset_id(self) -> str:
        res = (
            await self._db.table("personalities")
            .select("preset_id")
            .eq("user_id", self._user_id)
            .execute()
        )
        return res.data[0]["preset_id"] if res.data else "supportive"

    async def _preset(self) -> str:
        """Session-cached preset id (start() populates it; this is the fallback)."""
        if self._preset_id is None:
            self._preset_id = await self._get_preset_id()
        return self._preset_id

    async def _prewarm_acks(self) -> None:
        preset_id = self._preset_id or "supportive"
        phrases = _ACK_PHRASES.get(preset_id, _ACK_PHRASES["classic"]) + _TIMER_PHRASES.get(
            preset_id, _TIMER_PHRASES["classic"]
        )
        await asyncio.gather(*(_cached_phrase_audio(preset_id, p) for p in phrases))

    async def _send_ack(self, preset_id: str) -> None:
        """Instant spoken acknowledgment — the turn's first audio segment.
        Best-effort: any failure is swallowed and the turn proceeds silently."""
        try:
            phrase = random.choice(_ACK_PHRASES.get(preset_id, _ACK_PHRASES["classic"]))
            audio = await _cached_phrase_audio(preset_id, phrase)
            if not audio:
                return
            async with self._ws_lock:
                await self._ws.send_bytes(audio)
                await self._ws.send_json({"type": "segment_end"})
        except Exception:
            logger.warning("ack send failed", exc_info=True)

    async def _process_transcripts(self) -> None:
        stopped = False
        while not stopped:
            item = await self._transcript_q.get()
            if item is None:
                break
            kind, payload = item

            if kind == "timer_done":
                await self._announce_timer_done()
                continue

            # An utterance. Drain whatever else is already queued: rapid-fire
            # finalizations (Finalize flush + UtteranceEnd + speech continuing
            # into the thinking phase) merge into ONE agent turn instead of N
            # stale-context replies. A queued timer cue plays after the turn.
            texts = [payload]
            timer_pending = False
            while True:
                try:
                    nxt = self._transcript_q.get_nowait()
                except asyncio.QueueEmpty:
                    break
                if nxt is None:
                    stopped = True
                    break
                if nxt[0] == "utterance":
                    texts.append(nxt[1])
                elif nxt[0] == "timer_done":
                    timer_pending = True

            self._busy = True
            try:
                await self._handle_utterance(" ".join(texts))
            except Exception as exc:
                logger.exception("Voice turn failed")
                # Non-fatal error + done so the client returns to listening
                # instead of hanging in `thinking` forever.
                async with self._ws_lock:
                    await self._ws.send_json(
                        {
                            "type": "error",
                            "message": f"That one didn't go through — try again. ({exc})",
                            "fatal": False,
                        }
                    )
                    await self._ws.send_json({"type": "done"})
            finally:
                self._busy = False

            if timer_pending and not stopped:
                await self._announce_timer_done()

    async def _announce_timer_done(self) -> None:
        """Speak a canned rest-over cue: coach_announce → MP3 → segment_end →
        done, riding the client's normal playback rails. Best-effort like acks,
        but once coach_announce is out the client is in coach_speaking and MUST
        get a done."""
        self._timer_queued = False
        announced = False
        try:
            preset_id = await self._preset()
            phrases = _TIMER_PHRASES.get(preset_id, _TIMER_PHRASES["classic"])
            audio = await _cached_phrase_audio(preset_id, random.choice(phrases))
            if not audio:
                return
            async with self._ws_lock:
                await self._ws.send_json({"type": "coach_announce"})
                announced = True
                await self._ws.send_bytes(audio)
                await self._ws.send_json({"type": "segment_end"})
        except Exception:
            logger.warning("timer announcement failed", exc_info=True)
        finally:
            if announced:
                try:
                    async with self._ws_lock:
                        await self._ws.send_json({"type": "done"})
                except Exception:
                    pass  # client may already be gone

    async def _handle_utterance(self, transcript: str) -> None:
        self._cancel_turn.clear()
        async with self._ws_lock:
            await self._ws.send_json({"type": "transcript", "text": transcript})

        preset_id = await self._preset()
        # Heard-you feedback before the agent even starts thinking.
        await self._send_ack(preset_id)

        tts_buffer = ""
        tts_failed = False

        async def _speak(sentence: str) -> None:
            """TTS a sentence; after the first TTSError, degrade the turn to text."""
            nonlocal tts_failed
            if not sentence.strip() or self._cancel_turn.is_set():
                return
            if not tts_failed:
                try:
                    # Sanitized on the audio path only — the text fallback below
                    # keeps the raw sentence for the client to render.
                    spoken = _sanitize_for_speech(sentence)
                    if spoken:
                        await self._tts_and_send(spoken, preset_id)
                    return
                except TTSError as exc:
                    tts_failed = True
                    logger.warning("TTS unavailable, degrading turn to text: %s", exc)
                    async with self._ws_lock:
                        await self._ws.send_json(
                            {
                                "type": "error",
                                "message": "Coach voice is unavailable right now — showing text instead.",
                                "fatal": False,
                            }
                        )
            async with self._ws_lock:
                await self._ws.send_json(
                    {"type": "text_delta", "text": sentence.rstrip() + " "}
                )

        done_sent = False
        cancelled = False
        gen = _agent_events(transcript, self._session_id, self._user_id, self._db)
        async for event in gen:
            if self._cancel_turn.is_set():
                cancelled = True
                break

            if event["type"] == "text_delta":
                tts_buffer += event["text"]
                sentences, tts_buffer = _pop_sentences(tts_buffer)
                for sentence in sentences:
                    await _speak(sentence)

            elif event["type"] in ("app_action", "plan_proposal", "error"):
                async with self._ws_lock:
                    await self._ws.send_json(event)

            elif event["type"] == "done":
                await _speak(tts_buffer)
                async with self._ws_lock:
                    await self._ws.send_json({"type": "done"})
                done_sent = True

        if cancelled:
            # Barge-in: kill the upstream LLM stream and drop unspoken text —
            # the client already stopped playback and is listening again.
            await gen.aclose()
            tts_buffer = ""

        # Structural invariant: every turn ends with `done`, even if an upstream
        # generator ends early without one — the client's phase machine depends
        # on it to leave `thinking`/`coach_speaking`. (Raised exceptions are
        # handled by _process_transcripts, which sends error + done itself.)
        if not done_sent:
            await _speak(tts_buffer)
            async with self._ws_lock:
                await self._ws.send_json({"type": "done"})

    async def _tts_and_send(self, text: str, preset_id: str) -> None:
        sent_any = False
        try:
            async for chunk in synthesize(text, preset_id):
                if self._cancel_turn.is_set():
                    break  # barge-in mid-sentence: stop streaming immediately
                sent_any = True
                async with self._ws_lock:
                    await self._ws.send_bytes(chunk)
        finally:
            # segment_end even when synthesize dies mid-stream: it isolates the
            # partial MP3 in its own segment so the next sentence starts clean.
            if sent_any:
                async with self._ws_lock:
                    await self._ws.send_json({"type": "segment_end"})

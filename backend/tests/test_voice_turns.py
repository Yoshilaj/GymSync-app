"""VoiceSession turn machinery against a fake websocket (no Deepgram, no LLM):
transcript coalescing, barge-in cancellation, and timer_done announcements.

_agent_events and synthesize are monkeypatched at the voice-module level; the
Deepgram connection is never opened (no start()), so _process_transcripts and
_handle_utterance run exactly as in production minus the audio input.
"""
import asyncio

import app.agents.voice as voice_mod
from app.agents.voice import VoiceSession, _phrase_cache


class FakeWS:
    """Records every outbound frame in order."""

    def __init__(self):
        self.frames: list[tuple[str, object]] = []

    async def send_json(self, obj):
        self.frames.append(("json", obj))

    async def send_bytes(self, data):
        self.frames.append(("bytes", data))

    def json_types(self) -> list[str]:
        return [f[1]["type"] for f in self.frames if f[0] == "json"]


def _make_session(ws: FakeWS) -> VoiceSession:
    session = VoiceSession(ws, user_id="u1", session_id="s1", db=None)
    session._preset_id = "classic"  # skip the DB preset lookup
    return session


async def _fake_synthesize(text, preset_id):
    yield b"MP3"


def _run(session: VoiceSession, *items):
    """Queue items + stop sentinel, then run the processor loop to completion."""

    async def go():
        for item in items:
            await session._transcript_q.put(item)
        await session._transcript_q.put(None)
        await session._process_transcripts()

    asyncio.run(go())


def test_coalescing_merges_queued_utterances(monkeypatch):
    """Rapid-fire finalizations run as ONE agent turn with the joined text."""
    calls: list[str] = []

    def fake_agent(transcript, session_id, user_id, db, **kwargs):
        async def gen():
            calls.append(transcript)
            yield {"type": "text_delta", "text": "Nice work. "}
            yield {"type": "done"}

        return gen()

    monkeypatch.setattr(voice_mod, "_agent_events", fake_agent)
    monkeypatch.setattr(voice_mod, "synthesize", _fake_synthesize)
    _phrase_cache.clear()

    ws = FakeWS()
    session = _make_session(ws)
    _run(session, ("utterance", "sixty five kilos"), ("utterance", "for five reps"))

    assert calls == ["sixty five kilos for five reps"]
    assert ws.json_types().count("done") == 1


def test_barge_in_cancels_turn_and_sends_one_done(monkeypatch):
    """Cancel mid-stream: the agent generator is closed, audio stops, and the
    turn still ends with exactly one done."""
    state = {"closed": False, "yielded": 0}

    def fake_agent(transcript, session_id, user_id, db, **kwargs):
        async def gen():
            try:
                for i in range(50):
                    state["yielded"] += 1
                    yield {"type": "text_delta", "text": f"Sentence {i} ends. "}
                yield {"type": "done"}
            finally:
                state["closed"] = True

        return gen()

    monkeypatch.setattr(voice_mod, "_agent_events", fake_agent)
    monkeypatch.setattr(voice_mod, "synthesize", _fake_synthesize)
    _phrase_cache.clear()

    ws = FakeWS()
    session = _make_session(ws)

    # Barge in as soon as the first spoken sentence hits the wire.
    original_send_bytes = ws.send_bytes

    async def send_bytes_then_cancel(data):
        await original_send_bytes(data)
        session.request_cancel()

    ws.send_bytes = send_bytes_then_cancel

    _run(session, ("utterance", "tell me everything"))

    assert state["closed"], "agent generator must be closed on barge-in"
    assert state["yielded"] < 50, "turn must stop before the stream runs dry"
    assert ws.json_types().count("done") == 1


def test_request_cancel_is_noop_between_turns():
    session = _make_session(FakeWS())
    session.request_cancel()  # _busy is False
    assert not session._cancel_turn.is_set()


def test_timer_done_announces_when_idle(monkeypatch):
    monkeypatch.setattr(voice_mod, "synthesize", _fake_synthesize)
    _phrase_cache.clear()

    ws = FakeWS()
    session = _make_session(ws)
    _run(session, ("timer_done", None))

    types = ws.json_types()
    assert types == ["coach_announce", "segment_end", "done"]
    assert any(f[0] == "bytes" for f in ws.frames)


def test_timer_done_queued_behind_turn_plays_after_done(monkeypatch):
    def fake_agent(transcript, session_id, user_id, db, **kwargs):
        async def gen():
            yield {"type": "text_delta", "text": "Logged. "}
            yield {"type": "done"}

        return gen()

    monkeypatch.setattr(voice_mod, "_agent_events", fake_agent)
    monkeypatch.setattr(voice_mod, "synthesize", _fake_synthesize)
    _phrase_cache.clear()

    ws = FakeWS()
    session = _make_session(ws)

    async def go():
        # Both arrive before the processor runs; the stop sentinel comes much
        # later (production ordering — stop() ends the session, not the queue).
        await session._transcript_q.put(("utterance", "did five at sixty"))
        await session._transcript_q.put(("timer_done", None))
        task = asyncio.create_task(session._process_transcripts())
        for _ in range(200):
            await asyncio.sleep(0)
            if "coach_announce" in ws.json_types():
                break
        await session._transcript_q.put(None)
        await task

    asyncio.run(go())

    types = ws.json_types()
    # The turn's done comes before the announcement starts.
    assert types.index("coach_announce") > types.index("done")
    assert types.count("done") == 2  # turn + announcement


def test_stacked_timer_dones_collapse_to_one():
    ws = FakeWS()
    session = _make_session(ws)

    async def go():
        await session.announce_timer_done()
        await session.announce_timer_done()  # coalesced away
        assert session._transcript_q.qsize() == 1

    asyncio.run(go())

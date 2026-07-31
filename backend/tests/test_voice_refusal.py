"""The refused-voice handshake contract, from both ends.

When live voice is refused (Free has 0 sessions a month), the socket stays open
for text chat and the ack reports `voice: false`. That flag is the ONLY thing
telling the client not to open a microphone — the server has no VoiceSession to
feed, so every audio frame it then receives is dropped on the floor.

The client used to ignore it and render a listening state anyway: the waveform
moved, the mic ran, and no transcript could ever come back. These tests pin the
server half of that contract so the flag can't quietly disappear again.
"""
import json

import pytest

import app.routers.voice_ws as voice_ws_mod
from app.entitlements import QuotaExceeded
from tests.fake_supabase import FakeDB


class FakeWS:
    """Websocket that replays a scripted client, recording what it's sent."""

    def __init__(self, incoming: list[dict]):
        self.headers = {}
        self._incoming = list(incoming)
        self.sent: list[dict] = []
        self.accepted = False
        self.closed_code: int | None = None

    async def accept(self, subprotocol=None):
        self.accepted = True

    async def receive(self) -> dict:
        if self._incoming:
            return self._incoming.pop(0)
        return {"type": "websocket.disconnect"}

    async def send_json(self, obj):
        self.sent.append(obj)

    async def close(self, code=1000):
        self.closed_code = code

    def types(self) -> list[str]:
        return [m["type"] for m in self.sent]

    def first(self, type_: str) -> dict:
        return next(m for m in self.sent if m["type"] == type_)


class SpyVoiceSession:
    """Stands in for the real session so we can tell whether one was created."""

    created: list["SpyVoiceSession"] = []

    def __init__(self, ws, user_id, session_id, db):
        SpyVoiceSession.created.append(self)
        self.started = False

    async def start(self):
        self.started = True

    async def stop(self):
        pass


def _start_frame(**extra) -> dict:
    payload = {"type": "session_start", "session_id": "s1", "voice": True, **extra}
    return {"type": "websocket.receive", "text": json.dumps(payload)}


@pytest.fixture
def wired(monkeypatch):
    """Authenticate as u1, VoiceSession spied on, and s1 genuinely owned by u1.

    The session has to exist and belong to u1 because session_start now proves
    ownership before it will use the id (see app/session_store.py). These tests
    are about the refusal contract, so they take the happy ownership path.
    """
    SpyVoiceSession.created = []
    db = FakeDB()
    db.tables["workout_sessions"] = [{"id": "s1", "user_id": "u1"}]

    async def fake_db():
        return db

    async def fake_auth(token):
        return "u1"

    async def fake_consume(feature, user_id, db):
        return None

    monkeypatch.setattr(voice_ws_mod, "get_db", fake_db)
    monkeypatch.setattr(voice_ws_mod, "_authenticate", fake_auth)
    monkeypatch.setattr(voice_ws_mod, "consume_quota", fake_consume)
    monkeypatch.setattr(voice_ws_mod, "VoiceSession", SpyVoiceSession)
    return SpyVoiceSession


@pytest.mark.asyncio
async def test_refused_voice_acks_voice_false_and_starts_no_session(wired, monkeypatch):
    async def refuse(feature, user_id, db, **kwargs):
        raise QuotaExceeded(
            code="upgrade_required",
            feature=feature,
            current_tier="free",
            required_tier="pro",
            message="Live coaching is part of Pro.",
        )

    monkeypatch.setattr(voice_ws_mod, "check_quota", refuse)

    ws = FakeWS([_start_frame()])
    await voice_ws_mod.voice_ws(ws, "u1", token="t")

    # The refusal is a sales moment, not an error, and never a close: the same
    # socket carries text chat.
    assert ws.types() == ["upgrade_required", "ack"]
    assert ws.closed_code is None
    assert ws.first("upgrade_required")["required_tier"] == "pro"

    # The ack reports what the client GOT — this is the flag the client keys on.
    assert ws.first("ack")["voice"] is False
    assert wired.created == []


@pytest.mark.asyncio
async def test_allowed_voice_acks_voice_true_and_starts_a_session(wired, monkeypatch):
    async def allow(feature, user_id, db, **kwargs):
        return "pro", 9

    monkeypatch.setattr(voice_ws_mod, "check_quota", allow)

    ws = FakeWS([_start_frame()])
    await voice_ws_mod.voice_ws(ws, "u1", token="t")

    assert ws.types() == ["ack"]
    assert ws.first("ack")["voice"] is True
    assert len(wired.created) == 1
    assert wired.created[0].started


@pytest.mark.asyncio
async def test_audio_after_a_refusal_is_dropped_not_fed(wired, monkeypatch):
    """The other half of why the flag matters: a client that keeps streaming
    gets no response of any kind — there is nothing to feed the audio to."""

    async def refuse(feature, user_id, db, **kwargs):
        raise QuotaExceeded(
            code="upgrade_required",
            feature=feature,
            current_tier="free",
            required_tier="pro",
            message="Live coaching is part of Pro.",
        )

    monkeypatch.setattr(voice_ws_mod, "check_quota", refuse)

    ws = FakeWS([
        _start_frame(),
        {"type": "websocket.receive", "bytes": b"\x00\x01" * 160},
    ])
    await voice_ws_mod.voice_ws(ws, "u1", token="t")

    # Not one extra frame came back for the audio — silence is all the old
    # client had to go on.
    assert ws.types() == ["upgrade_required", "ack"]

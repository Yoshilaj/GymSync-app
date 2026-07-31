"""A session id off the wire must belong to the caller.

The backend queries Supabase with the service-role key, so RLS never runs and no
database rule stops one user's `session_id` from being used by another. `session_id`
is the only identifier a client supplies that isn't the token subject — it arrives in
the `POST /sets` body and the voice socket's `session_start` frame — so these tests
pin the guard that makes every downstream `.eq("id", session_id)` safe.

The overwrite test is the important one: `completed_sets` is unique on
(session_id, exercise_name, set_index) with no user_id, so an unchecked write doesn't
merely add a stray row, it replaces the victim's.
"""
import json

import pytest
from fastapi import HTTPException

import app.routers.voice_ws as voice_ws_mod
from app.agents.core import _load_history, _save_history
from app.routers.progress import SetLog, log_set
from app.session_store import assert_session_owner, owns_session
from tests.fake_supabase import FakeDB

OWNER = "user-owner"
ATTACKER = "user-attacker"
SESSION = "session-owned-by-owner"


@pytest.fixture
def db() -> FakeDB:
    fake = FakeDB()
    fake.tables["workout_sessions"] = [
        {
            "id": SESSION,
            "user_id": OWNER,
            "is_active": True,
            "chat_history": [{"role": "user", "content": "my knee hurts"}],
        }
    ]
    fake.tables["completed_sets"] = [
        {
            "session_id": SESSION,
            "user_id": OWNER,
            "exercise_name": "Back Squat",
            "set_index": 0,
            "reps": 5,
            "weight": 100.0,
            "weight_unit": "kg",
        }
    ]
    return fake


# ── the guard itself ──────────────────────────────────────────────────────────

async def test_owns_session_true_for_owner(db):
    assert await owns_session(SESSION, OWNER, db) is True


async def test_owns_session_false_for_stranger(db):
    assert await owns_session(SESSION, ATTACKER, db) is False


async def test_owns_session_false_for_unknown_id(db):
    assert await owns_session("no-such-session", OWNER, db) is False


async def test_assert_raises_404_not_403(db):
    """403 would confirm the session exists — the one bit a guessed id lacks."""
    with pytest.raises(HTTPException) as exc:
        await assert_session_owner(SESSION, ATTACKER, db)
    assert exc.value.status_code == 404


async def test_assert_passes_for_owner(db):
    await assert_session_owner(SESSION, OWNER, db)  # must not raise


# ── POST /sets ────────────────────────────────────────────────────────────────

async def test_log_set_rejects_foreign_session(db):
    body = SetLog(
        session_id=SESSION,
        exercise_name="Back Squat",
        set_index=0,
        reps=1,
        weight=999.0,
    )
    with pytest.raises(HTTPException) as exc:
        await log_set(body, user_id=ATTACKER, db=db)
    assert exc.value.status_code == 404


async def test_log_set_does_not_overwrite_the_victims_set(db):
    """The unique key omits user_id, so an unchecked write REPLACES rather than adds."""
    body = SetLog(
        session_id=SESSION,
        exercise_name="Back Squat",
        set_index=0,
        reps=1,
        weight=999.0,
    )
    with pytest.raises(HTTPException):
        await log_set(body, user_id=ATTACKER, db=db)

    rows = db.tables["completed_sets"]
    assert len(rows) == 1
    assert rows[0]["user_id"] == OWNER
    assert rows[0]["reps"] == 5
    assert rows[0]["weight"] == 100.0


async def test_log_set_still_works_for_the_owner(db):
    body = SetLog(
        session_id=SESSION,
        exercise_name="Bench Press",
        set_index=0,
        reps=8,
        weight=60.0,
    )
    await log_set(body, user_id=OWNER, db=db)

    added = [r for r in db.tables["completed_sets"] if r["exercise_name"] == "Bench Press"]
    assert len(added) == 1
    assert added[0]["user_id"] == OWNER


# ── chat history ──────────────────────────────────────────────────────────────

async def test_load_history_scoped_to_owner(db):
    history = await _load_history(SESSION, None, db, OWNER)
    assert history == [{"role": "user", "content": "my knee hurts"}]


async def test_load_history_returns_nothing_for_stranger(db):
    """A session-scoped chat log is health-adjacent; a stranger reads an empty list."""
    assert await _load_history(SESSION, None, db, ATTACKER) == []


async def test_save_history_cannot_overwrite_a_strangers_thread(db):
    await _save_history(
        SESSION,
        [],
        "injected user turn",
        "injected assistant turn",
        db,
        user_id=ATTACKER,
    )
    stored = db.tables["workout_sessions"][0]["chat_history"]
    assert stored == [{"role": "user", "content": "my knee hurts"}]


async def test_save_history_still_writes_for_the_owner(db):
    await _save_history(
        SESSION,
        [],
        "how many sets left?",
        "two more on squats.",
        db,
        user_id=OWNER,
    )
    stored = db.tables["workout_sessions"][0]["chat_history"]
    assert [m["content"] for m in stored] == ["how many sets left?", "two more on squats."]


# ── the voice socket's session_start ──────────────────────────────────────────

class _FakeWS:
    """Replays one scripted client frame and records what it's sent."""

    def __init__(self, frames: list[dict]) -> None:
        self.headers: dict = {}
        self._incoming = list(frames)
        self.sent: list[dict] = []
        self.closed_code: int | None = None

    async def accept(self, subprotocol=None):
        pass

    async def receive(self) -> dict:
        if self._incoming:
            return self._incoming.pop(0)
        return {"type": "websocket.disconnect"}

    async def send_json(self, obj):
        self.sent.append(obj)

    async def close(self, code=1000):
        self.closed_code = code


@pytest.fixture
def socket(monkeypatch, db):
    """Wire the socket up as ATTACKER, with quota always allowed."""
    async def fake_db():
        return db

    async def fake_auth(token):
        return ATTACKER

    async def allow(feature, user_id, database, **kwargs):
        return "premium", 99

    async def noop(feature, user_id, database, **kwargs):
        return None

    monkeypatch.setattr(voice_ws_mod, "get_db", fake_db)
    monkeypatch.setattr(voice_ws_mod, "_authenticate", fake_auth)
    monkeypatch.setattr(voice_ws_mod, "check_quota", allow)
    monkeypatch.setattr(voice_ws_mod, "consume_quota", noop)
    return db


async def test_session_start_refuses_a_foreign_session_id(socket):
    """The id arrives on the wire; everything downstream trusts this one check."""
    frame = {
        "type": "websocket.receive",
        "text": json.dumps(
            {"type": "session_start", "session_id": SESSION, "voice": False}
        ),
    }
    ws = _FakeWS([frame])
    await voice_ws_mod.voice_ws(ws, ATTACKER, token="t")

    types = [m["type"] for m in ws.sent]
    assert "error" in types
    error = next(m for m in ws.sent if m["type"] == "error")
    assert error["message"] == "Session not found"

    # Degrades to a free-form session rather than closing — but the ack must not
    # hand the attacker's client the id back as if it had been accepted.
    ack = next(m for m in ws.sent if m["type"] == "ack")
    assert ack["session_id"] is None

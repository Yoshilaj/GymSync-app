"""The offline outbox's server-side contract.

The app queues logging writes while offline and replays them on reconnect, so
three behaviours are load-bearing and pinned here:

1. POST /session with a client-minted id is idempotent — a replay of "create
   session X" must return X unchanged, and must NOT run the deactivate-all
   sweep again (which would end a newer session the user legitimately started).
   Someone else's id gets the same 404 shape as every other unowned resource.
2. DELETE /session/{id} tolerates replays — "already ended" is a success.
3. POST /sets accepts performed_at so a Monday flush of Sunday's workout lands
   on Sunday — clamped, because a wrong phone clock must not write the future
   or rewrite deep history.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import BackgroundTasks, HTTPException

from app.routers.progress import SetLog, log_set
from app.routers.session import SessionStart, end_session, start_session
from tests.fake_supabase import FakeDB

OWNER = "user-owner"
STRANGER = "user-stranger"
CLIENT_ID = "11111111-1111-4111-8111-111111111111"


@pytest.fixture
def db() -> FakeDB:
    return FakeDB()


# ── idempotent create with a client-minted id ────────────────────────────────

async def test_create_with_client_id_uses_it(db):
    res = await start_session(SessionStart(id=CLIENT_ID), BackgroundTasks(), OWNER, db)
    assert res["session"]["id"] == CLIENT_ID
    assert res["session"]["is_active"] is True


async def test_create_replay_returns_existing_row_unchanged(db):
    await start_session(SessionStart(id=CLIENT_ID), BackgroundTasks(), OWNER, db)
    replay = await start_session(SessionStart(id=CLIENT_ID), BackgroundTasks(), OWNER, db)
    assert replay["session"]["id"] == CLIENT_ID
    assert len(db.tables["workout_sessions"]) == 1


async def test_create_replay_does_not_end_newer_session(db):
    # Offline session X synced late: by the time its create replays, the user
    # has started (online) session Y. The replay must leave Y active.
    await start_session(SessionStart(id=CLIENT_ID), BackgroundTasks(), OWNER, db)
    newer = await start_session(SessionStart(), BackgroundTasks(), OWNER, db)
    newer_id = newer["session"]["id"]

    await start_session(SessionStart(id=CLIENT_ID), BackgroundTasks(), OWNER, db)  # replay of X

    rows = {r["id"]: r for r in db.tables["workout_sessions"]}
    assert rows[newer_id]["is_active"] is True


async def test_create_with_foreign_id_is_404(db):
    await start_session(SessionStart(id=CLIENT_ID), BackgroundTasks(), OWNER, db)
    with pytest.raises(HTTPException) as e:
        await start_session(SessionStart(id=CLIENT_ID), BackgroundTasks(), STRANGER, db)
    assert e.value.status_code == 404


# ── idempotent end ───────────────────────────────────────────────────────────

async def test_end_twice_succeeds(db):
    await start_session(SessionStart(id=CLIENT_ID), BackgroundTasks(), OWNER, db)
    first = await end_session(CLIENT_ID, BackgroundTasks(), OWNER, db)
    second = await end_session(CLIENT_ID, BackgroundTasks(), OWNER, db)
    assert first["status"] == "ended"
    assert second["status"] == "ended"
    assert db.tables["workout_sessions"][0]["is_active"] is False


async def test_end_unknown_session_is_404(db):
    with pytest.raises(HTTPException) as e:
        await end_session("no-such-session", BackgroundTasks(), OWNER, db)
    assert e.value.status_code == 404


# ── performed_at on sets ─────────────────────────────────────────────────────

def _set_body(**overrides) -> SetLog:
    base = dict(
        session_id=CLIENT_ID,
        exercise_name="Back Squat",
        set_index=0,
        reps=5,
        weight=100.0,
        weight_unit="kg",
    )
    base.update(overrides)
    return SetLog(**base)


async def _session(db):
    await start_session(SessionStart(id=CLIENT_ID), BackgroundTasks(), OWNER, db)


async def test_performed_at_is_written(db):
    await _session(db)
    performed = datetime.now(timezone.utc) - timedelta(days=2)
    await log_set(_set_body(performed_at=performed), OWNER, db)
    row = db.tables["completed_sets"][0]
    assert row["logged_at"] == performed.isoformat()


async def test_performed_at_future_clamped_to_now(db):
    await _session(db)
    before = datetime.now(timezone.utc)
    await log_set(
        _set_body(performed_at=before + timedelta(days=3)), OWNER, db
    )
    logged = datetime.fromisoformat(db.tables["completed_sets"][0]["logged_at"])
    assert before <= logged <= datetime.now(timezone.utc)


async def test_performed_at_deep_past_clamped_to_window(db):
    await _session(db)
    await log_set(
        _set_body(performed_at=datetime.now(timezone.utc) - timedelta(days=90)),
        OWNER,
        db,
    )
    logged = datetime.fromisoformat(db.tables["completed_sets"][0]["logged_at"])
    assert logged >= datetime.now(timezone.utc) - timedelta(days=15)


async def test_performed_at_omitted_leaves_default(db):
    await _session(db)
    await log_set(_set_body(), OWNER, db)
    assert "logged_at" not in db.tables["completed_sets"][0]

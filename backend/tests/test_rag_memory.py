"""
Personal memory — the writer, the tier gate, and the promise that neither can break a turn.

`personal_chunks` had no writer at all before this, and `personal.prefetch` had no caller,
so these tests exist to keep both ends attached.
"""
import pytest

from app.agents import core
from app.rag import memory
from tests.fake_supabase import FakeDB


@pytest.fixture()
def db():
    return FakeDB()


# ── remember() ────────────────────────────────────────────────────────────────

async def test_a_memory_is_written_with_its_vector_and_model_tag(db):
    rid = await memory.remember("u1", "preference", "Trains fasted before 6am.", db)

    assert rid
    row = db.tables["personal_chunks"][0]
    assert row["user_id"] == "u1"
    assert row["kind"] == "preference"
    assert row["content"] == "Trains fasted before 6am."
    # pgvector text literal, 768-d, tagged with what produced it.
    assert row["embedding"].startswith("[") and row["embedding"].endswith("]")
    assert len(row["embedding"].split(",")) == 768
    assert row["embedding_model"]


async def test_an_unknown_kind_is_a_loud_failure_not_a_silent_drop(db):
    # A typo'd kind would otherwise become a PostgREST 400 that remember() swallows,
    # and the memory would vanish forever.
    with pytest.raises(ValueError):
        await memory.remember("u1", "notaknd", "text", db)
    assert db.tables["personal_chunks"] == []


async def test_blank_content_is_skipped(db):
    assert await memory.remember("u1", "coaching_note", "   ", db) is None
    assert db.tables["personal_chunks"] == []


async def test_writing_the_same_memory_twice_reuses_the_first_row(db):
    # A retried "end session" must not leave two identical summaries behind.
    first = await memory.remember("u1", "session_summary", "Good session.", db)
    second = await memory.remember("u1", "session_summary", "Good session.", db)

    assert first == second
    assert len(db.tables["personal_chunks"]) == 1


async def test_the_same_text_for_two_users_is_two_rows(db):
    await memory.remember("u1", "preference", "Hates burpees.", db)
    await memory.remember("u2", "preference", "Hates burpees.", db)
    assert len(db.tables["personal_chunks"]) == 2


async def test_overlong_content_is_truncated_rather_than_rejected(db):
    await memory.remember("u1", "coaching_note", "x" * (memory.MAX_CONTENT_CHARS + 500), db)
    stored = db.tables["personal_chunks"][0]["content"]
    assert len(stored) <= memory.MAX_CONTENT_CHARS + 1  # +1 for the ellipsis
    assert stored.endswith("…")


async def test_source_id_links_the_memory_back_to_its_row(db):
    await memory.remember("u1", "injury", "Left knee.", db, source_id="inj-1")
    assert db.tables["personal_chunks"][0]["source_id"] == "inj-1"


async def test_a_database_failure_returns_none_instead_of_raising():
    # Writing a memory is never the point of the request that triggers it.
    class Broken:
        def table(self, _):
            raise RuntimeError("db down")

    assert await memory.remember("u1", "preference", "x", Broken()) is None


# ── The tier gate on the read side ────────────────────────────────────────────

@pytest.mark.parametrize("tier", ["free", "pro"])
async def test_personal_memory_is_not_fetched_below_premium(tier, monkeypatch):
    called = False

    async def spy(*a, **k):
        nonlocal called
        called = True
        return "<personal_memory>leak</personal_memory>"

    monkeypatch.setattr(core.personal, "prefetch", spy)
    out = await core._load_personal_memory("u1", "how's my knee?", None, "text", tier)

    assert out == ""
    assert called is False, "prefetch must not even run below Premium"


async def test_premium_gets_the_block(monkeypatch):
    async def spy(user_id, query, db, channel):
        assert channel == "voice"
        return "<personal_memory>ok</personal_memory>"

    monkeypatch.setattr(core.personal, "prefetch", spy)
    out = await core._load_personal_memory("u1", "q", None, "voice", "premium")
    assert out == "<personal_memory>ok</personal_memory>"

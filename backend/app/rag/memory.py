"""
Personal memory writer — the other half of rag/personal.py.

`personal.prefetch` reads `personal_chunks`; this module is the only thing that writes it.
Kept separate so the read path (hot, per-turn, latency-critical) and the write path
(occasional, tolerant of a slow embed) can't tangle.

What belongs here: genuinely semantic user data — injuries, stated preferences, distilled
session summaries, plan rationale. What does NOT: exact numbers. Sets, reps, PRs and volume
live in `completed_sets` and are read with SQL, because "how much did I squat" deserves an
answer that is right rather than one that is merely similar (003_rag.sql:62-70).

Isolation: `user_id` is always passed structurally by the caller, never model-supplied.

Fault tolerance: writing a memory is never the point of the request that triggers it — a
user ending a workout wants the workout ended. Every failure here logs and returns None so
the caller proceeds.
"""
import logging

from supabase import AsyncClient

from app.rag.embedder import get_embedder

logger = logging.getLogger("gymsync.rag")

# Mirrors the CHECK constraint in 003_rag.sql:75-76. Kept as a frozenset so a typo'd kind
# fails loudly here instead of becoming a 400 from PostgREST that the caller swallows.
KINDS = frozenset(
    {"coaching_note", "injury", "preference", "session_summary", "plan_rationale"}
)

# Personal chunks are atomic — there is no parent tier to expand into (expand.py:6-7), so a
# chunk has to be self-contained AND small enough that several fit the packing budget
# (1500 tokens for text, 800 for voice). Anything longer is a summarization bug upstream.
MAX_CONTENT_CHARS = 1200


def to_pgvector(vec: list[float]) -> str:
    """pgvector text literal — the format PostgREST needs for a vector column."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


async def remember(
    user_id: str,
    kind: str,
    content: str,
    db: AsyncClient,
    *,
    source_id: str | None = None,
    occurred_at: str | None = None,
) -> str | None:
    """
    Write one personal memory. Returns its row id, or None if skipped or failed.

    Skipped (not an error): blank content, or an identical memory already on file — the
    session summarizer can run twice for one session if a client retries the end call.
    """
    if kind not in KINDS:
        raise ValueError(f"unknown personal memory kind: {kind!r} (expected one of {sorted(KINDS)})")

    content = (content or "").strip()
    if not content:
        return None
    if len(content) > MAX_CONTENT_CHARS:
        content = content[:MAX_CONTENT_CHARS].rstrip() + "…"

    try:
        # Dedup before embedding — the embed is the expensive half, and an exact repeat is
        # the common failure mode (a retried request), not a rare one.
        existing = await (
            db.table("personal_chunks")
            .select("id")
            .eq("user_id", user_id)
            .eq("kind", kind)
            .eq("content", content)
            .limit(1)
            .execute()
        )
        if existing.data:
            return str(existing.data[0]["id"])

        embedder = get_embedder()
        vectors = await embedder.embed_documents([content])
        if not vectors:
            return None

        row: dict = {
            "user_id": user_id,
            "kind": kind,
            "content": content,
            "embedding": to_pgvector(vectors[0]),
            # Tag what produced the vector. The column is VECTOR(768) so a model swap is a
            # silent quality failure, not a loud one — this is how it stays detectable.
            "embedding_model": embedder.model_name,
        }
        if source_id:
            row["source_id"] = source_id
        if occurred_at:
            row["occurred_at"] = occurred_at

        res = await db.table("personal_chunks").insert(row).execute()
    except Exception as exc:  # noqa: BLE001 — best-effort; never break the caller
        logger.error("personal remember failed (kind=%s): %s", kind, exc)
        return None

    return str(res.data[0]["id"]) if res.data else None

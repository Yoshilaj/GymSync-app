"""
Personal memory prefetch — per-user semantic recall injected into every turn.

Unlike knowledge (a model-invoked tool), personal memory is small and always relevant, so
it is pre-fetched and prepended to the turn like the existing <session_state> block. It is
the cheap path: hybrid search + RRF, but NO parent expansion (chunks are atomic) and NO
rerank. The voice channel uses the low-latency params.

Isolation: every query LEADS with user_id (passed structurally from the request, never
model-supplied) — the real tenant boundary. This path is intentionally NOT cached: a
mis-scoped or collided cache key would leak one user's memory to another, and the query is
already cheap and user-partitioned.

Fault-tolerant: any failure (missing RPC, embedding backend down) logs and returns "" so
the turn proceeds without augmentation rather than erroring.
"""
from supabase import AsyncClient

from app.monitoring import logger, traced
from app.rag.embedder import StubEmbedder
from app.rag.fusion import reciprocal_rank_fusion
from app.rag.models import RetrievalParams
from app.rag.packing import pack
from app.rag.search import hybrid_search

_embedder = StubEmbedder()


@traced(name="personal_prefetch")
async def prefetch(user_id: str, query: str, db: AsyncClient, channel: str = "text") -> str:
    """Return a `<personal_memory>…</personal_memory>` block, or "" if nothing/on failure."""
    if not query.strip():
        return ""
    params = RetrievalParams.for_voice() if channel == "voice" else RetrievalParams.for_text()
    try:
        embedding = await _embedder.embed_query(query)
        vector_hits, lexical_hits = await hybrid_search(
            db, corpus="personal", embedding=embedding, query_text=query,
            params=params, user_id=user_id,
        )
        fused = reciprocal_rank_fusion(
            [vector_hits, lexical_hits], k=params.rrf_k, top_n=params.top_n_rerank
        )
        if not fused:
            return ""
        result = pack(fused, token_budget=params.token_budget)
    except Exception as exc:  # noqa: BLE001 — best-effort; never break the turn
        logger.error("personal_prefetch_failed", extra={"extra_data": {"error": str(exc)}})
        return ""

    if not result.context:
        return ""
    return f"<personal_memory>\n{result.context}\n</personal_memory>\n\n"

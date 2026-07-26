"""
Hybrid retrieval — the DB-facing stage. Returns the vector and lexical candidate lists
separately so fusion.reciprocal_rank_fusion can merge them in the app layer (testable,
no SQL fusion logic).

Each modality is a Supabase RPC (migration 006_rag_rpc.sql). The SQL functions own the
things that must live server-side: `SET LOCAL hnsw.ef_search` per path, the cosine `<=>`
ordering, `ts_rank`/`websearch_to_tsquery` for the keyword side, and — critically for
personal memory — the leading `user_id` filter that is the tenant-isolation boundary.

Until 006 is applied and the corpus is embedded, these RPCs do not exist and the calls
raise. Callers in the hot path (personal.prefetch, pipeline.search) swallow that so a
missing RAG backend degrades to "no augmentation" rather than breaking the turn.
"""
from typing import Literal

from supabase import AsyncClient

from app.rag.models import Chunk, RetrievalParams

Corpus = Literal["knowledge", "personal"]


def _to_chunk(row: dict) -> Chunk:
    meta = {
        key: row[key]
        for key in ("doc_type", "year", "kind", "chunk_index", "occurred_at")
        if key in row and row[key] is not None
    }
    parent = row.get("parent_id")
    return Chunk(
        id=str(row["id"]),
        content=row.get("content", ""),
        source=row.get("source"),
        parent_id=str(parent) if parent else None,
        metadata=meta,
    )


async def _rpc_rows(db: AsyncClient, name: str, args: dict) -> list[dict]:
    res = await db.rpc(name, args).execute()
    return res.data or []


async def hybrid_search(
    db: AsyncClient,
    *,
    corpus: Corpus,
    embedding: list[float],
    query_text: str,
    params: RetrievalParams,
    user_id: str | None = None,
) -> tuple[list[Chunk], list[Chunk]]:
    """Return (vector_ranked, lexical_ranked) candidate lists for RRF."""
    if corpus == "knowledge":
        vrows = await _rpc_rows(db, "match_knowledge_vector", {
            "query_embedding": embedding,
            "match_count": params.top_k_vector,
            "filter_doc_type": params.doc_type,
            "filter_year_min": params.year_min,
            "ef": params.ef_search,
        })
        lrows = await _rpc_rows(db, "match_knowledge_lexical", {
            "query_text": query_text,
            "match_count": params.top_k_lexical,
            "filter_doc_type": params.doc_type,
            "filter_year_min": params.year_min,
        })
    else:
        if not user_id:
            raise ValueError("personal search requires user_id (isolation boundary)")
        vrows = await _rpc_rows(db, "match_personal_vector", {
            "p_user_id": user_id,
            "query_embedding": embedding,
            "match_count": params.top_k_vector,
            "filter_kinds": params.kinds,
            "ef": params.ef_search,
        })
        lrows = await _rpc_rows(db, "match_personal_lexical", {
            "p_user_id": user_id,
            "query_text": query_text,
            "match_count": params.top_k_lexical,
            "filter_kinds": params.kinds,
        })
    return [_to_chunk(r) for r in vrows], [_to_chunk(r) for r in lrows]

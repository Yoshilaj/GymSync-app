"""
Knowledge retrieval pipeline — the shared research corpus.

Stages: embed query → hybrid search (vector ∥ lexical) → RRF fuse → rerank → parent
expansion → token-budget pack → RetrievalResult. Exposed to the agent as the
`search_knowledge` tool via `search()`, which is deliberately fault-tolerant: a missing
RPC / embedding backend returns an error payload the model can narrate, never an exception
that aborts the turn.

Caching (why the knowledge layer and NOT final generations): the corpus is static and
queries repeat, so query→fused-passages is deterministic and highly cacheable, while
generations are personalized/streamed and would barely hit. Two caches, both keyed by a
content hash that folds in the embedding model + corpus_version (bump on re-ingest to
invalidate): the query embedding (cheap recompute skip) and the full retrieval result.
Personal retrieval is deliberately never cached (see personal.py).
"""
from dataclasses import asdict

from supabase import AsyncClient

from app.cache import Cache, make_key
from app.config import settings
from app.monitoring import logger, metrics, traced
from app.rag.embedder import get_embedder
from app.rag.expand import expand_to_parents
from app.rag.fusion import reciprocal_rank_fusion
from app.rag.models import RetrievalParams, RetrievalResult
from app.rag.packing import pack
from app.rag.protocols import Embedder, Reranker
from app.rag.rerank import get_reranker
from app.rag.search import hybrid_search


def _normalize(query: str) -> str:
    return " ".join(query.lower().split())


def _try_cache() -> Cache | None:
    """Cache singleton, or None outside an initialized app (e.g. unit tests)."""
    try:
        from app.runtime import get_cache
        return get_cache()
    except RuntimeError:
        return None


class KnowledgePipeline:
    def __init__(self, embedder: Embedder | None = None, reranker: Reranker | None = None) -> None:
        self.embedder: Embedder = embedder or get_embedder()
        self.reranker: Reranker = reranker or get_reranker()

    async def _embed_query(self, query: str, cache: Cache | None) -> list[float]:
        if cache is None:
            return await self.embedder.embed_query(query)
        key = make_key("emb", self.embedder.model_name, _normalize(query))
        cached = await cache.get(key)
        if cached is not None:
            return cached
        embedding = await self.embedder.embed_query(query)
        await cache.set(key, embedding, ttl_s=settings.cache_ttl_s)
        return embedding

    async def run(self, query: str, db: AsyncClient, params: RetrievalParams) -> RetrievalResult:
        cache = _try_cache()
        embedding = await self._embed_query(query, cache)
        vector_hits, lexical_hits = await hybrid_search(
            db, corpus="knowledge", embedding=embedding, query_text=query, params=params
        )
        fused = reciprocal_rank_fusion(
            [vector_hits, lexical_hits], k=params.rrf_k, top_n=params.top_k_vector
        )
        reranked = await self.reranker.rerank(query, fused, params.top_n_rerank)
        parents = await expand_to_parents(db, reranked)
        return pack(parents, token_budget=params.token_budget)


_knowledge = KnowledgePipeline()


def _result_key(query: str, params: RetrievalParams) -> str:
    return make_key(
        "knowledge",
        _normalize(query),
        params.doc_type,
        params.year_min,
        params.top_k_vector,
        params.ef_search,
        _knowledge.embedder.model_name,
        settings.knowledge_corpus_version,
    )


@traced(name="knowledge_search")
async def search(args: dict, ctx) -> dict:
    """Tool entrypoint for `search_knowledge`. `ctx` is agents.tools.ToolContext."""
    query = (args.get("query") or "").strip()
    if not query:
        return {"error": "empty query"}

    params = RetrievalParams.for_text()  # tool runs mainly on the reasoning/text path
    if args.get("doc_type"):
        params.doc_type = args["doc_type"]

    cache = _try_cache()
    key = _result_key(query, params)
    if cache is not None:
        hit = await cache.get(key)
        metrics.record_cache(hit=hit is not None)
        if hit is not None:
            return hit  # hit → return cached; miss → continue

    try:
        result = await _knowledge.run(query, ctx.db, params)
    except Exception as exc:  # noqa: BLE001 — RAG is best-effort augmentation
        logger.error("knowledge_search_failed", extra={"extra_data": {"error": str(exc)}})
        return {"error": "knowledge base unavailable", "context": "", "citations": []}

    payload = {
        "context": result.context,
        "citations": [asdict(c) for c in result.citations],
        "chunk_count": len(result.chunks),
    }
    if cache is not None:
        await cache.set(key, payload, ttl_s=settings.knowledge_cache_ttl_s)
    return payload

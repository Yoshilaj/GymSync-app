"""
IdentityReranker — no-op reranker stub.

Returns the fused order unchanged, truncated to top_n. The real cross-encoder reranker
(query × chunk relevance scoring) slots in behind the same Reranker protocol later.
"""
from app.rag.models import Chunk


class IdentityReranker:
    async def rerank(self, query: str, chunks: list[Chunk], top_n: int) -> list[Chunk]:
        return chunks[:top_n]

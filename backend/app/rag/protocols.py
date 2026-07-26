"""
Swap boundaries for the parts we are deliberately NOT building yet.

Embedder — turns text into vectors. Real impl (nomic-embed-text-v1.5, 768-d) lands with
           ingestion; StubEmbedder satisfies this Protocol so the pipeline runs end-to-end.
Reranker — reorders fused candidates by cross-encoder relevance. IdentityReranker is the
           no-op stand-in until a real reranker is wired.
"""
from typing import Protocol, runtime_checkable

from app.rag.models import Chunk


@runtime_checkable
class Embedder(Protocol):
    model_name: str
    dimensions: int

    async def embed_query(self, text: str) -> list[float]: ...
    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...


@runtime_checkable
class Reranker(Protocol):
    async def rerank(self, query: str, chunks: list[Chunk], top_n: int) -> list[Chunk]: ...

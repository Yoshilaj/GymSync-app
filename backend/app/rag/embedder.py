"""
Embedders behind the `Embedder` protocol (protocols.py).

  StubEmbedder  — deterministic SHA256 stand-in; no semantics, but exercises the plumbing.
  NomicEmbedder — real nomic-embed-text-v1.5 (768-d) via fastembed/ONNX. Applies the
                  model's task prefixes: `search_query:` for queries, `search_document:`
                  for passages — getting this wrong quietly wrecks retrieval quality.
  build_embedder / get_embedder — config-selected singleton (settings.embedder).

Why fastembed: in-process (no extra service), light enough for the slim prod container,
fast on CPU for the ~1s voice TTFT budget, and it owns the prefix handling. fastembed is
synchronous and CPU-bound, so calls are offloaded with asyncio.to_thread to keep the event
loop responsive; the ONNX model is lazily loaded on first embed (import stays cheap).
"""
import asyncio
import hashlib
import math

from app.config import settings


class StubEmbedder:
    model_name = "stub-nomic-embed-768"
    dimensions = 768

    async def embed_query(self, text: str) -> list[float]:
        return self._vec(text)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def _vec(self, text: str) -> list[float]:
        out: list[float] = []
        counter = 0
        while len(out) < self.dimensions:
            block = hashlib.sha256(f"{text}:{counter}".encode("utf-8")).digest()
            for i in range(0, len(block), 4):
                if len(out) >= self.dimensions:
                    break
                out.append(int.from_bytes(block[i:i + 4], "big") / 2**32 - 0.5)
            counter += 1
        norm = math.sqrt(sum(v * v for v in out)) or 1.0
        return [v / norm for v in out]  # unit-normalized → cosine-ready


class NomicEmbedder:
    """Real 768-d embeddings via fastembed. Model name is configurable so the quantized
    `-Q` build can be swapped in for a smaller container; both share the embedding space.
    """
    dimensions = 768

    def __init__(self, model_name: str = "nomic-ai/nomic-embed-text-v1.5") -> None:
        self.model_name = model_name
        self._model = None  # lazy: created on first embed (downloads weights if absent)

    def _ensure_model(self):
        if self._model is None:
            # Imported here so the stub path never requires fastembed installed.
            from fastembed import TextEmbedding

            self._model = TextEmbedding(model_name=self.model_name)
        return self._model

    @staticmethod
    def _normalize(vec) -> list[float]:
        # fastembed returns un-normalized nomic vectors; the schema (003_rag.sql) and the
        # stub both assume unit length. Normalize so cosine == dot and the space is canonical.
        norm = math.sqrt(sum(float(x) * float(x) for x in vec)) or 1.0
        return [float(x) / norm for x in vec]

    def _embed_queries_sync(self, texts: list[str]) -> list[list[float]]:
        model = self._ensure_model()
        # query_embed applies the `search_query:` task prefix nomic expects.
        return [self._normalize(v) for v in model.query_embed(texts)]

    def _embed_documents_sync(self, texts: list[str]) -> list[list[float]]:
        model = self._ensure_model()
        # passage_embed applies the `search_document:` task prefix.
        return [self._normalize(v) for v in model.passage_embed(texts)]

    async def embed_query(self, text: str) -> list[float]:
        vecs = await asyncio.to_thread(self._embed_queries_sync, [text])
        return vecs[0]

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return await asyncio.to_thread(self._embed_documents_sync, texts)


def build_embedder():
    """Construct the embedder named by settings.embedder ('stub' | 'nomic')."""
    if settings.embedder == "nomic":
        return NomicEmbedder(settings.embedding_model)
    return StubEmbedder()


_embedder = None


def get_embedder():
    """Process-wide embedder singleton so the ONNX model loads at most once."""
    global _embedder
    if _embedder is None:
        _embedder = build_embedder()
    return _embedder

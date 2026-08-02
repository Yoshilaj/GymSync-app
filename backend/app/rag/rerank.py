"""
Rerankers behind the Reranker protocol (protocols.py).

  IdentityReranker     — no-op; returns the fused order truncated to top_n (default; used in
                         tests and when reranking is disabled).
  CrossEncoderReranker — real query×chunk relevance scoring via fastembed's TextCrossEncoder
                         (ms-marco-MiniLM, ONNX, in-process). A bi-encoder (the embedder)
                         retrieves candidates fast but scores query and chunk separately; a
                         cross-encoder reads them TOGETHER, so it ranks the final few far more
                         accurately. It reorders the fused candidates before the token-budget
                         pack, so the sharpest passage leads.
  build_reranker / get_reranker — config-selected singleton (settings.reranker).

fastembed is synchronous and CPU-bound, so scoring is offloaded with asyncio.to_thread to keep
the event loop responsive; the ONNX model is lazily loaded on first rerank (import stays cheap).
"""
import asyncio

from app.config import settings
from app.rag.models import Chunk


class IdentityReranker:
    async def rerank(self, query: str, chunks: list[Chunk], top_n: int) -> list[Chunk]:
        return chunks[:top_n]


# How many candidates to score per onnxruntime call. Small enough that the
# activation tensors stay cheap, large enough that per-call overhead doesn't
# dominate — the accuracy path only ever has ~40 candidates, so this is 5 calls.
_RERANK_BATCH = 8


class CrossEncoderReranker:
    def __init__(self, model_name: str = "Xenova/ms-marco-MiniLM-L-6-v2") -> None:
        self.model_name = model_name
        self._model = None  # lazy: created on first rerank (downloads weights if absent)

    def _ensure_model(self):
        if self._model is None:
            # Imported here so the identity path never requires the cross-encoder model.
            from fastembed.rerank.cross_encoder import TextCrossEncoder

            self._model = TextCrossEncoder(model_name=self.model_name)
        return self._model

    def _score_sync(self, query: str, docs: list[str]) -> list[float]:
        # rerank() returns a relevance score per doc, aligned with input order.
        #
        # Scored in batches because the whole candidate set at once is what
        # OOM-killed production. onnxruntime allocates activation tensors for the
        # entire batch and its arena does not hand the memory back, so the peak
        # is set by the largest batch ever run — not by the steady state.
        #
        # Measured on the real model with 40 corpus-length chunks:
        #
        #   steady state (both models loaded)   904 MB
        #   all 40 scored in one call          1390 MB   (+486)
        #   scored in batches of 8              978 MB   (+74)
        #
        # The server died at 1.85 GB on a 2 GB machine with the one-call version.
        # Scores are identical either way: same model, same inputs, same order —
        # only the tensor allocation changes.
        model = self._ensure_model()
        scores: list[float] = []
        for i in range(0, len(docs), _RERANK_BATCH):
            scores.extend(float(s) for s in model.rerank(query, docs[i:i + _RERANK_BATCH]))
        return scores

    async def rerank(self, query: str, chunks: list[Chunk], top_n: int) -> list[Chunk]:
        if not chunks:
            return []
        docs = [c.content for c in chunks]
        scores = await asyncio.to_thread(self._score_sync, query, docs)
        for chunk, score in zip(chunks, scores):
            chunk.score = score            # overwrite fusion score with the sharper CE score
        ranked = sorted(chunks, key=lambda c: c.score, reverse=True)
        return ranked[:top_n]


def build_reranker():
    """Construct the reranker named by settings.reranker ('identity' | 'cross_encoder')."""
    if settings.reranker == "cross_encoder":
        return CrossEncoderReranker(settings.reranker_model)
    return IdentityReranker()


_reranker = None


def get_reranker():
    """Process-wide reranker singleton so the ONNX model loads at most once."""
    global _reranker
    if _reranker is None:
        _reranker = build_reranker()
    return _reranker

"""
Reciprocal Rank Fusion — merge the vector and lexical rankings into one list.

RRF score for a chunk = Σ_lists 1 / (k + rank_in_list). It needs only ranks (not
comparable raw scores across modalities), which is exactly why hybrid vector+keyword
retrieval uses it. k damps the contribution of low ranks; 60 is the canonical default.
"""
from app.rag.models import Chunk


def reciprocal_rank_fusion(
    ranked_lists: list[list[Chunk]],
    *,
    k: int = 60,
    top_n: int | None = None,
) -> list[Chunk]:
    scores: dict[str, float] = {}
    by_id: dict[str, Chunk] = {}
    for lst in ranked_lists:
        for rank, chunk in enumerate(lst):
            scores[chunk.id] = scores.get(chunk.id, 0.0) + 1.0 / (k + rank + 1)
            by_id.setdefault(chunk.id, chunk)  # first occurrence keeps the fuller record
    fused = sorted(by_id.values(), key=lambda c: scores[c.id], reverse=True)
    for c in fused:
        c.score = scores[c.id]
    return fused[:top_n] if top_n is not None else fused

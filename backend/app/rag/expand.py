"""
Parent expansion (knowledge corpus only).

Child chunks are embedded for retrieval precision; the LLM should read the fuller parent
SECTION for context. After fusion+rerank we dedupe the surviving children by parent_id,
fetch the parent sections, and return them ordered by the best child score that pointed to
each parent. Personal memory is atomic (no parent tier) and skips this stage entirely.
"""
from supabase import AsyncClient

from app.rag.models import Chunk


async def expand_to_parents(db: AsyncClient, chunks: list[Chunk]) -> list[Chunk]:
    # Best child score per parent, preserving the ranked order of first appearance.
    best: dict[str, float] = {}
    order: list[str] = []
    for c in chunks:
        pid = c.parent_id
        if not pid:
            continue
        if pid not in best:
            order.append(pid)
        best[pid] = max(best.get(pid, float("-inf")), c.score)

    if not order:
        return chunks  # nothing had a parent (e.g. already parent-level) → pass through

    res = await db.table("knowledge_parents").select(
        "id, source, section, content, doc_type, year"
    ).in_("id", order).execute()
    rows = {str(r["id"]): r for r in (res.data or [])}

    parents: list[Chunk] = []
    for pid in order:
        r = rows.get(pid)
        if not r:
            continue
        meta = {k: r[k] for k in ("section", "doc_type", "year") if r.get(k) is not None}
        parents.append(Chunk(
            id=pid,
            content=r.get("content", ""),
            source=r.get("source"),
            score=best[pid],
            metadata=meta,
        ))
    # Highest-scoring parent first.
    parents.sort(key=lambda c: c.score, reverse=True)
    return parents

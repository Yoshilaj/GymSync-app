"""
Context packing — assemble ranked chunks into a token-budgeted, cited block.

Greedy fill in rank order until the budget would be exceeded (always keep at least one
chunk so a single large passage is never dropped to empty). Each passage is prefixed with
a bracketed citation index the model can reference. Token count is a cheap ~4-chars/token
estimate — good enough for budgeting without importing a tokenizer.
"""
from app.rag.models import Chunk, Citation, RetrievalResult


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _date_only(occurred_at) -> str | None:
    """'2026-07-14' from a timestamptz string — the model needs the day, not the clock."""
    if not occurred_at:
        return None
    return str(occurred_at)[:10]


def pack(chunks: list[Chunk], *, token_budget: int) -> RetrievalResult:
    parts: list[str] = []
    citations: list[Citation] = []
    included: list[Chunk] = []
    used = 0

    for chunk in chunks:
        cost = estimate_tokens(chunk.content)
        if included and used + cost > token_budget:
            break  # keep the first chunk regardless; stop once the budget is spent
        # Knowledge chunks always carry a source (knowledge_chunks.source is NOT NULL).
        # Personal ones never do — the RPC selects NULL::text — so they label themselves
        # with what they actually are: kind + when. "[1] injury (2026-07-14)" tells the
        # model something; the old "[1] unknown" told it nothing.
        cite = Citation(
            source=chunk.source or chunk.metadata.get("kind") or "unknown",
            year=chunk.metadata.get("year"),
            doc_type=chunk.metadata.get("doc_type"),
            snippet=chunk.content[:160],
        )
        idx = len(citations) + 1
        dated = cite.year or _date_only(chunk.metadata.get("occurred_at"))
        header = f"[{idx}] {cite.source}" + (f" ({dated})" if dated else "")
        parts.append(f"{header}\n{chunk.content}")
        citations.append(cite)
        included.append(chunk)
        used += cost

    return RetrievalResult(
        context="\n\n".join(parts),
        citations=citations,
        chunks=included,
        trace={"packed_tokens": used, "packed_chunks": len(included), "candidates": len(chunks)},
    )

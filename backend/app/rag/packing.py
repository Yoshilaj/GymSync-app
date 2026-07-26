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


def pack(chunks: list[Chunk], *, token_budget: int) -> RetrievalResult:
    parts: list[str] = []
    citations: list[Citation] = []
    included: list[Chunk] = []
    used = 0

    for chunk in chunks:
        cost = estimate_tokens(chunk.content)
        if included and used + cost > token_budget:
            break  # keep the first chunk regardless; stop once the budget is spent
        cite = Citation(
            source=chunk.source or "unknown",
            year=chunk.metadata.get("year"),
            doc_type=chunk.metadata.get("doc_type"),
            snippet=chunk.content[:160],
        )
        idx = len(citations) + 1
        header = f"[{idx}] {cite.source}" + (f" ({cite.year})" if cite.year else "")
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

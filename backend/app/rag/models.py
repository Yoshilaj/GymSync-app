"""
Value types shared across the retrieval stages.

Chunk           — one retrieved unit (child chunk, expanded parent, or personal memory).
Citation        — provenance for a packed passage (source/year/doc_type + snippet).
RetrievalResult — the packed output handed to the agent: context text + citations + trace.
RetrievalParams — per-path knobs. `for_voice()` favors latency (small K, ef_search=40,
                  tight budget); `for_text()` favors accuracy (larger K, ef_search=100).
"""
from dataclasses import dataclass, field


@dataclass
class Chunk:
    id: str
    content: str
    source: str | None = None
    score: float = 0.0                       # fusion/rerank score (higher = better)
    parent_id: str | None = None
    metadata: dict = field(default_factory=dict)  # doc_type, year, kind, chunk_index, ...


@dataclass
class Citation:
    source: str
    year: int | None = None
    doc_type: str | None = None
    snippet: str = ""


@dataclass
class RetrievalResult:
    context: str                              # packed, ready to inject into the prompt
    citations: list[Citation] = field(default_factory=list)
    chunks: list[Chunk] = field(default_factory=list)
    trace: dict = field(default_factory=dict)  # stage counts/timings for observability


@dataclass
class RetrievalParams:
    top_k_vector: int = 20
    top_k_lexical: int = 20
    top_n_rerank: int = 6
    ef_search: int = 100                      # HNSW search effort (accuracy path)
    rrf_k: int = 60                           # RRF damping constant
    token_budget: int = 1500
    doc_type: str | None = None               # knowledge pre-filter
    year_min: int | None = None               # knowledge pre-filter
    kinds: list[str] | None = None            # personal kind filter (injury/preference/...)

    @classmethod
    def for_voice(cls) -> "RetrievalParams":
        # Speed path: fewer candidates, low ef_search, tight budget → protect ~1s TTFT.
        return cls(
            top_k_vector=12, top_k_lexical=12, top_n_rerank=4,
            ef_search=40, token_budget=800,
        )

    @classmethod
    def for_text(cls) -> "RetrievalParams":
        # Accuracy path: defaults.
        return cls()

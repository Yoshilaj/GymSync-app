"""
Sections → parents + child chunks.

The parent/child split is the core retrieval design (003_rag.sql):
  - CHILD chunks are what get embedded — small, so a query matches a precise passage.
  - PARENT sections are what the LLM reads — the fuller context around that passage.
The pipeline's expand_to_parents maps a matched child back to its parent at query time.

Pure module (no app/db imports). Token counts are APPROXIMATED by word count here
(~1 token ≈ 0.75 words) to avoid a tiktoken dependency for v1 — good enough to size chunks;
tune with real spot-checks in M4. Splitting happens on sentence boundaries so a chunk never
ends mid-sentence, with a small overlap so a fact spanning a boundary isn't lost.
"""
import re
from dataclasses import dataclass, field

from app.ingest.parse import ParsedDoc

# ~512-token children with ~15% overlap (plan §4), approximated in words.
_CHILD_WORDS = 380
_OVERLAP_WORDS = 60

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


@dataclass
class Parent:
    section: str
    content: str
    doc_type: str
    year: int | None


@dataclass
class ChildChunk:
    parent_index: int     # index into the doc's parents list (resolved to parent_id at load)
    chunk_index: int      # 0-based, GLOBAL within the source — half of UNIQUE(source, chunk_index)
    content: str
    doc_type: str
    year: int | None


@dataclass
class ChunkedDoc:
    source: str
    parents: list[Parent] = field(default_factory=list)
    children: list[ChildChunk] = field(default_factory=list)


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENT_SPLIT.split(text.strip()) if s.strip()]


def _split_section(text: str) -> list[str]:
    """Greedy sentence packing to ~_CHILD_WORDS with ~_OVERLAP_WORDS carried between chunks."""
    sents = _sentences(text)
    if not sents:
        return []

    chunks: list[str] = []
    cur: list[str] = []
    cur_words = 0
    for sent in sents:
        w = len(sent.split())
        if cur and cur_words + w > _CHILD_WORDS:
            chunks.append(" ".join(cur))
            # Carry trailing sentences as overlap for the next chunk.
            overlap: list[str] = []
            ow = 0
            for s in reversed(cur):
                sw = len(s.split())
                if ow + sw > _OVERLAP_WORDS:
                    break
                overlap.insert(0, s)
                ow += sw
            cur = overlap[:]
            cur_words = ow
        cur.append(sent)
        cur_words += w
    if cur:
        chunks.append(" ".join(cur))
    return chunks


def chunk_doc(doc: ParsedDoc) -> ChunkedDoc:
    out = ChunkedDoc(source=doc.source)
    global_idx = 0
    for p_i, sec in enumerate(doc.sections):
        out.parents.append(Parent(
            section=sec.title,
            content=sec.text,
            doc_type=doc.doc_type,
            year=doc.year,
        ))
        for child_text in _split_section(sec.text):
            out.children.append(ChildChunk(
                parent_index=p_i,
                chunk_index=global_idx,
                content=child_text,
                doc_type=doc.doc_type,
                year=doc.year,
            ))
            global_idx += 1
    return out

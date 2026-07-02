from app.rag.models import Chunk
from app.rag.packing import estimate_tokens, pack


def _chunk(cid: str, text: str, **meta) -> Chunk:
    return Chunk(id=cid, content=text, source=meta.pop("source", "src"), metadata=meta)


def test_pack_respects_budget():
    big = "word " * 400  # ~500 tokens
    chunks = [_chunk("1", big), _chunk("2", big), _chunk("3", big)]
    result = pack(chunks, token_budget=600)
    # Budget only fits one ~500-token chunk plus header slack; not all three.
    assert len(result.chunks) < 3
    assert result.trace["packed_tokens"] <= 600 + estimate_tokens(big)


def test_pack_always_keeps_at_least_one_oversized_chunk():
    huge = "word " * 5000
    result = pack([_chunk("1", huge)], token_budget=10)
    assert len(result.chunks) == 1  # never drops to empty


def test_pack_builds_numbered_citations():
    result = pack([_chunk("1", "alpha", year=2020), _chunk("2", "beta")], token_budget=10_000)
    assert len(result.citations) == 2
    assert "[1]" in result.context
    assert "[2]" in result.context
    assert result.citations[0].year == 2020

from app.rag.fusion import reciprocal_rank_fusion
from app.rag.models import Chunk


def _c(cid: str) -> Chunk:
    return Chunk(id=cid, content=cid)


def test_rrf_rewards_agreement_across_lists():
    # "b" is high in both lists → should win despite "a" topping list 1.
    vec = [_c("a"), _c("b"), _c("c")]
    lex = [_c("b"), _c("d"), _c("a")]
    fused = reciprocal_rank_fusion([vec, lex], k=60)
    assert fused[0].id == "b"


def test_rrf_dedupes_by_id():
    vec = [_c("a"), _c("b")]
    lex = [_c("a")]
    fused = reciprocal_rank_fusion([vec, lex], k=60)
    assert sorted(c.id for c in fused) == ["a", "b"]


def test_rrf_top_n_truncates():
    vec = [_c(str(i)) for i in range(10)]
    fused = reciprocal_rank_fusion([vec], k=60, top_n=3)
    assert len(fused) == 3


def test_rrf_sets_score():
    fused = reciprocal_rank_fusion([[_c("a")]], k=60)
    assert fused[0].score > 0

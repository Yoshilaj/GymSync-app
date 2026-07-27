"""UtteranceAggregator: is_final fragments accumulate until a boundary flush.

Pure class (no Deepgram) — the boundary signals themselves (speech_final /
from_finalize / UtteranceEnd / force-flush) are exercised in test_voice_turns.
"""
from app.agents.voice import UtteranceAggregator


def test_accumulates_and_joins_fragments():
    agg = UtteranceAggregator()
    agg.add_final("sixty five")
    agg.add_final("kilos")
    assert agg.flush() == "sixty five kilos"


def test_flush_clears_state():
    agg = UtteranceAggregator()
    agg.add_final("first")
    agg.flush()
    assert agg.flush() is None


def test_empty_flush_returns_none():
    agg = UtteranceAggregator()
    assert agg.flush() is None


def test_whitespace_fragments_ignored():
    agg = UtteranceAggregator()
    agg.add_final("  ")
    agg.add_final("")
    agg.add_final(" five reps ")
    assert agg.flush() == "five reps"


def test_generation_bumps_on_every_flush():
    # The post-Finalize force-flush uses generation to detect that a real
    # boundary already handled the utterance — even an empty flush must bump.
    agg = UtteranceAggregator()
    g0 = agg.generation
    agg.flush()
    assert agg.generation == g0 + 1
    agg.add_final("hi")
    agg.flush()
    assert agg.generation == g0 + 2

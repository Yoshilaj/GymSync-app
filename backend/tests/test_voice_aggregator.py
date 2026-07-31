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


def test_generation_bumps_only_when_an_utterance_is_released():
    # The post-Finalize force-flush uses generation to detect that a real
    # boundary already handled the utterance. An EMPTY flush handled nothing,
    # so it must not consume the generation the force-flush is waiting on.
    agg = UtteranceAggregator()
    g0 = agg.generation
    agg.flush()
    assert agg.generation == g0
    agg.add_final("hi")
    agg.flush()
    assert agg.generation == g0 + 1


def test_late_fragment_after_empty_boundary_still_reaches_force_flush():
    # The silent-hang regression: UtteranceEnd fires on an empty buffer, then
    # the real fragment lands. The client's gate is closed by now, so no more
    # audio will advance Deepgram's endpointing — the armed force-flush is the
    # only thing left that can release this, and it only fires while the
    # generation it captured is unchanged.
    agg = UtteranceAggregator()
    gen_at_request = agg.generation

    agg.flush()                    # empty boundary — releases nothing
    agg.add_final("sixty five")    # fragment arrives late

    assert agg.generation == gen_at_request
    assert agg.flush() == "sixty five"

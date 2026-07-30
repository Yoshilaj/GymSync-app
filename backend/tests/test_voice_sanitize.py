"""Speech sanitizer + segment protocol unit tests (no network, no DB)."""
import asyncio

import pytest

from app.agents.voice import _pop_sentences, _sanitize_for_speech


@pytest.mark.parametrize(
    ("raw", "spoken"),
    [
        # The bug that started it all.
        ("Your first exercise is **Bench Press**.", "Your first exercise is Bench Press."),
        ("*easy* and ***hard***", "easy and hard"),
        ("__all out__", "all out"),
        # single underscore untouched (snake_case safety)
        ("try the pause_rep style", "try the pause_rep style"),
        ("## Today's plan", "Today's plan"),
        ("> rest well", "rest well"),
        ("- Squats\n- Lunges", "Squats Lunges"),
        ("* Squats", "Squats"),
        ("see the [form video](http://x.co/v) here", "see the form video here"),
        ("more at https://gymsync.app/tips ok", "more at ok"),
        ("use `pause reps` today", "use pause reps today"),
        # sets/reps notation → spoken form
        ("3x8 bench", "3 by 8 bench"),
        ("Do 3x8-12 today.", "Do 3 by 8 to 12 today."),
        ("5X5 squats", "5 by 5 squats"),
        ("aim for 8-12 reps", "aim for 8 to 12 reps"),
        ("2-3 sets is plenty", "2 to 3 sets is plenty"),
        # hyphenated words survive (no reps/sets lookahead match)
        ("push-ups are great", "push-ups are great"),
        ("a 10-minute warm-up", "a 10-minute warm-up"),
        # whitespace collapse
        ("too   many\n\nspaces", "too many spaces"),
        # pure markdown → empty (caller skips TTS)
        ("```\ncode\n```", ""),
        ("**", "**"),  # unpaired markers left alone — better spoken oddly than eaten
        # emoji: Aura vocalizes their Unicode names ("💪" → "muscle")
        ("Great work! 💪", "Great work!"),
        ("Nice job 💪🔥 keep going", "Nice job keep going"),
        ("Let's crush it 👊🏽", "Let's crush it"),  # skin-tone modifier
        ("❤️ that effort", "that effort"),  # VS16 sequence
        ("💪💪💪", ""),  # pure emoji → empty (caller skips TTS)
        ("日本語はそのまま", "日本語はそのまま"),  # CJK text is NOT emoji
    ],
)
def test_sanitize_for_speech(raw: str, spoken: str) -> None:
    assert _sanitize_for_speech(raw) == spoken


def test_combined_plan_line() -> None:
    raw = "**Push day**: Bench Press 3x8-12, then [OHP](https://x.co) `strict` 5x5."
    assert (
        _sanitize_for_speech(raw)
        == "Push day: Bench Press 3 by 8 to 12, then OHP strict 5 by 5."
    )


def test_unicode_times_and_en_dash_still_expand() -> None:
    """The model writes 4×4–6, not 4x4-6 — the notation rules cover both."""
    assert _sanitize_for_speech("Bench Press 4×4–6") == "Bench Press 4 by 4 to 6"


# ── sentence segmentation ────────────────────────────────────────────────────
# The coach renders data one item per line, and those lines have no terminator.
# Splitting on line breaks turns each into its own TTS segment, so the first
# exercise starts playing while the rest are still being synthesised.

def test_pop_sentences_splits_on_line_breaks() -> None:
    buf = "Today is Upper A.\nBarbell Bench Press 4x4-6\nBent-Over Row 4x4-6\nPull-Up 3x6-10"
    sentences, remainder = _pop_sentences(buf)
    assert sentences == [
        "Today is Upper A.",
        "Barbell Bench Press 4x4-6",
        "Bent-Over Row 4x4-6",
    ]
    # Last line is held back — more of it may still be streaming in.
    assert remainder == "Pull-Up 3x6-10"


def test_pop_sentences_still_splits_on_terminators() -> None:
    sentences, remainder = _pop_sentences("Logged. Set two of three. Next up")
    assert sentences == ["Logged.", "Set two of three."]
    assert remainder == "Next up"


def test_pop_sentences_handles_the_paragraph_break_between_tool_rounds() -> None:
    """_agent_events inserts \\n\\n either side of a tool call."""
    sentences, _ = _pop_sentences("Pulling up your plan.\n\nYou're on Upper A.\n")
    assert sentences == ["Pulling up your plan.", "You're on Upper A."]


def test_pop_sentences_blank_segments_are_speak_safe() -> None:
    """A leading break yields an empty segment; _speak drops it rather than
    handing "" to the TTS provider."""
    sentences, _ = _pop_sentences("\nBench Press 4x4-6\n")
    assert all(not s.strip() or s.strip() for s in sentences)
    assert [s for s in sentences if s.strip()] == ["Bench Press 4x4-6"]
    assert _pop_sentences("") == ([], "")


# ── segment_end emission ─────────────────────────────────────────────────────


class _FakeWS:
    def __init__(self) -> None:
        self.frames: list[tuple[str, object]] = []

    async def send_bytes(self, b: bytes) -> None:
        self.frames.append(("bytes", b))

    async def send_json(self, obj: dict) -> None:
        self.frames.append(("json", obj))


def _make_session(ws: _FakeWS):
    from app.agents.voice import VoiceSession

    return VoiceSession(ws, user_id="u1", session_id=None, db=None)


def test_tts_and_send_emits_segment_end(monkeypatch: pytest.MonkeyPatch) -> None:
    ws = _FakeWS()
    session = _make_session(ws)

    async def fake_synthesize(text: str, preset_id: str):
        yield b"aa"
        yield b"bb"

    monkeypatch.setattr("app.agents.voice.synthesize", fake_synthesize)
    asyncio.run(session._tts_and_send("hello there", "classic"))

    assert ws.frames == [
        ("bytes", b"aa"),
        ("bytes", b"bb"),
        ("json", {"type": "segment_end"}),
    ]


def test_segment_end_fires_on_midstream_tts_death(monkeypatch: pytest.MonkeyPatch) -> None:
    """A provider dying after partial bytes must still close the segment so the
    next sentence's MP3 starts clean on the client."""
    from app.agents.tts import TTSError

    ws = _FakeWS()
    session = _make_session(ws)

    async def dying_synthesize(text: str, preset_id: str):
        yield b"partial"
        raise TTSError("provider died")

    monkeypatch.setattr("app.agents.voice.synthesize", dying_synthesize)
    with pytest.raises(TTSError):
        asyncio.run(session._tts_and_send("hello", "classic"))

    assert ws.frames == [
        ("bytes", b"partial"),
        ("json", {"type": "segment_end"}),
    ]


def test_no_bytes_no_segment_end(monkeypatch: pytest.MonkeyPatch) -> None:
    ws = _FakeWS()
    session = _make_session(ws)

    async def empty_synthesize(text: str, preset_id: str):
        return
        yield  # pragma: no cover — makes this an async generator

    monkeypatch.setattr("app.agents.voice.synthesize", empty_synthesize)
    asyncio.run(session._tts_and_send("hello", "classic"))
    assert ws.frames == []

"""Personality prompt + recent-history rendering (no network, no DB).

These guard the fixes for the "trying too hard" replies: shared talking
discipline on every preset, no self-description, and real numbers available to
cite. They assert the prompt *contains its constraints* rather than asserting on
model output, which is the only part that's deterministic.
"""
import re
from datetime import date, timedelta

import pytest

from app.agents.core import _render_recent_history
from app.agents.personalities import (
    DEFAULT_PRESET,
    PRESETS,
    build_system_prompt,
    get_voice,
    list_presets,
)

ALL_PRESETS = sorted(PRESETS)

# Pictographic planes only — enough to spot 💪 / 🙌 / 😮‍💨 in prompt text. A ZWJ
# sequence counts as its two visible parts, which is the strict reading for a cap.
_EMOJI_RE = re.compile("[\U0001f000-\U0001faff☀-➿]")


def _has_emoji(text: str) -> bool:
    return bool(_EMOJI_RE.search(text))


def _flat(text: str) -> str:
    """Collapse whitespace before matching a phrase.

    The prompt is hand-wrapped prose, so asserting on a literal containing "\\n  "
    fails the moment an unrelated edit re-wraps the paragraph. Only assert on
    wrapping where the line structure IS the thing under test.
    """
    return re.sub(r"\s+", " ", text)


# ── Shared discipline ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("preset_id", ALL_PRESETS)
def test_every_preset_inherits_the_voice_rules(preset_id):
    """Formatting, length and no-self-description are shared, not per-preset."""
    prompt = build_system_prompt(preset_id)
    assert "HOW YOU TALK" in prompt
    assert "Plain text only" in prompt
    assert "Never describe yourself" in prompt
    assert "one to three sentences" in prompt


@pytest.mark.parametrize("preset_id", ALL_PRESETS)
def test_data_goes_one_item_per_line(preset_id):
    """A day's exercises are tabular data. Banning lists outright made the coach
    jam seven of them into one comma run, which is what read as "rough"."""
    prompt = build_system_prompt(preset_id)
    assert "Data gets one item per line" in prompt
    assert "Never run them together as a comma list" in prompt
    # A worked shape, so "one per line" isn't left to interpretation.
    assert "Barbell Bench Press 4x4-6\n  Bent-Over Row 4x4-6" in prompt


@pytest.mark.parametrize("preset_id", ALL_PRESETS)
def test_bullet_markers_are_still_banned(preset_id):
    """Allowing line breaks must not reopen the door to the bullet manifesto."""
    prompt = _flat(build_system_prompt(preset_id))
    assert "never start a line with a bullet or number marker" in prompt
    assert "This is for data only" in prompt


@pytest.mark.parametrize("preset_id", ALL_PRESETS)
def test_every_preset_keeps_the_tool_mechanics(preset_id):
    prompt = build_system_prompt(preset_id)
    assert "SESSION AWARENESS:" in prompt
    assert "SET LOGGING:" in prompt
    assert "PLAN GENERATION:" in prompt


@pytest.mark.parametrize("preset_id", ALL_PRESETS)
def test_every_preset_names_the_context_blocks_it_can_cite(preset_id):
    """"Knows your data cold" only works if the prompt points at the data."""
    prompt = build_system_prompt(preset_id)
    for block in ("<user_profile>", "<session_state>", "<recent_history>"):
        assert block in prompt


@pytest.mark.parametrize("preset_id", ALL_PRESETS)
def test_tool_names_never_reach_the_user(preset_id):
    """It once opened a reply with "Call get_current_session_state to see what's
    on today." — internal plumbing on the user's screen."""
    assert "Never name a tool and never narrate calling one" in _flat(
        build_system_prompt(preset_id)
    )


def test_meta_questions_do_not_escalate():
    """A "what are you?" turn used to trip the open-ended-reasoning clause."""
    assert "Never call escalate_to_reasoning for small talk" in build_system_prompt("classic")


# ── Per-preset flavour ────────────────────────────────────────────────────────

# The phrases each preset must be told to avoid — these are what a model reaches
# for when told to "be encouraging", and they are the cringe.
BANNED = {
    "classic": ["crushing it", "you've got this", "journey"],
    "supportive": ["so proud of you", "you're crushing it", "believe in yourself"],
    "energetic": ["beast mode", "no pain no gain", "you're a machine"],
}


@pytest.mark.parametrize("preset_id", ALL_PRESETS)
def test_emoji_policy_is_per_personality(preset_id):
    """Emoji were banned outright, which left every voice equally flat. They are
    now a per-preset trait — the thing that keeps the three distinct."""
    prompt = _flat(build_system_prompt(preset_id))
    # The blanket ban is gone from the shared rules...
    assert "no code fences, and never start a line" in prompt
    # ...replaced by a cap that applies wherever they ARE allowed.
    assert "two per reply at the very most" in prompt


def test_classic_stays_emoji_free():
    prompt = build_system_prompt("classic")
    assert "No emoji, ever" in prompt
    assert "No exclamation marks" in prompt
    # Nothing in classic's own examples may model emoji use.
    assert not _has_emoji(PRESETS["classic"]["voice_examples"])


@pytest.mark.parametrize("preset_id", ["supportive", "energetic"])
def test_warm_presets_permit_and_demonstrate_emoji(preset_id):
    """A rule the examples contradict loses to the examples, so both have to
    agree: these two say emoji are allowed AND show one in place."""
    assert "emoji" in PRESETS[preset_id]["system_prompt"].lower()
    assert _has_emoji(PRESETS[preset_id]["voice_examples"])


@pytest.mark.parametrize("preset_id", ["supportive", "energetic"])
def test_motivational_phrases_must_be_specific_not_slogans(preset_id):
    """"Motivational" is how the original cringe got in. Each preset contrasts a
    concrete line against the slogan it replaces."""
    prompt = PRESETS[preset_id]["system_prompt"]
    assert "beats" in prompt
    assert "slogan" in prompt


@pytest.mark.parametrize("preset_id", ALL_PRESETS)
def test_examples_never_exceed_the_two_emoji_cap(preset_id):
    """The examples are the de facto spec — none may model a third emoji."""
    for line in PRESETS[preset_id]["voice_examples"].splitlines():
        assert len(_EMOJI_RE.findall(line)) <= 2, line


@pytest.mark.parametrize("preset_id", ALL_PRESETS)
def test_preset_carries_its_banned_vocabulary(preset_id):
    prompt = build_system_prompt(preset_id)
    for phrase in BANNED[preset_id]:
        assert phrase in prompt, f"{preset_id} no longer bans {phrase!r}"


@pytest.mark.parametrize("preset_id", ALL_PRESETS)
def test_preset_ships_worked_examples(preset_id):
    """Examples steer voice far harder than adjectives; every preset needs some,
    including one showing the one-line answer to "what's your personality?"."""
    prompt = build_system_prompt(preset_id)
    assert "Examples of your voice:" in prompt
    assert PRESETS[preset_id]["voice_examples"] in prompt
    assert "what's your personality?" in prompt


def test_presets_are_actually_distinct():
    prompts = {p: PRESETS[p]["system_prompt"] for p in ALL_PRESETS}
    assert len(set(prompts.values())) == len(ALL_PRESETS)
    assert len({build_system_prompt(p) for p in ALL_PRESETS}) == len(ALL_PRESETS)


# ── Fallbacks and wiring ──────────────────────────────────────────────────────

def test_unknown_preset_falls_back_consistently():
    """core/voice/router all resolve through DEFAULT_PRESET — they used to
    disagree (classic in two places, supportive in two others)."""
    assert DEFAULT_PRESET in PRESETS
    assert build_system_prompt("no-such-preset") == build_system_prompt(DEFAULT_PRESET)
    for provider in ("aura", "elevenlabs"):
        assert get_voice("no-such-preset", provider) == get_voice(DEFAULT_PRESET, provider)


def test_ack_and_timer_phrases_cover_the_fallback_preset():
    from app.agents.voice import _ACK_PHRASES, _TIMER_PHRASES

    assert DEFAULT_PRESET in _ACK_PHRASES
    assert DEFAULT_PRESET in _TIMER_PHRASES
    assert set(_ACK_PHRASES) == set(PRESETS)
    assert set(_TIMER_PHRASES) == set(PRESETS)


def test_custom_override_still_gets_the_shared_rules():
    prompt = build_system_prompt("classic", custom_override="You are a pirate.")
    assert "You are a pirate." in prompt
    assert "HOW YOU TALK" in prompt          # discipline is not optional
    assert "SET LOGGING:" in prompt
    assert PRESETS["classic"]["system_prompt"] not in prompt


def test_each_preset_has_a_distinct_voice_per_provider():
    for provider in ("aura", "elevenlabs"):
        voices = {get_voice(p, provider) for p in ALL_PRESETS}
        assert len(voices) == len(ALL_PRESETS)


def test_list_presets_matches_the_frontend_union():
    """src/types/index.ts: CoachPersonality = 'classic' | 'supportive' | 'energetic'."""
    assert {p["id"] for p in list_presets()} == {"classic", "supportive", "energetic"}
    assert all(p["name"] for p in list_presets())


# ── <recent_history> ──────────────────────────────────────────────────────────

def _row(name, reps, weight, day_offset, unit="kg"):
    when = date.today() - timedelta(days=day_offset)
    return {
        "exercise_name": name,
        "reps": reps,
        "weight": weight,
        "weight_unit": unit,
        "logged_at": f"{when.isoformat()}T10:00:00",
    }


def test_history_reports_streak_sessions_and_bests():
    block = _render_recent_history(
        [_row("Bench Press", 5, 60, 0), _row("Squat", 3, 95, 0), _row("Bench Press", 8, 55, 1)]
    )
    assert block.startswith("<recent_history>")
    assert block.endswith("</recent_history>\n\n")
    assert "streak: 2 days" in block
    assert "last_sessions:" in block
    assert "Squat: 95kg x3" in block


def test_history_flags_a_stalled_lift():
    """The signal that makes proactivity possible — a computed fact the coach
    can act on rather than something it has to infer from a set list."""
    rows = [_row("Bench Press", 5, 60, d) for d in (0, 1, 2)]
    block = _render_recent_history(rows)
    assert "stalled:" in block
    assert "Bench Press: 60kg, unchanged 3 sessions" in block


def test_history_does_not_flag_a_progressing_lift():
    rows = [_row("Bench Press", 5, w, d) for w, d in ((65, 0), (62.5, 1), (60, 2))]
    assert "stalled:" not in _render_recent_history(rows)


def test_history_ranks_best_set_by_estimated_1rm():
    """A heavy single should beat a light set of ten."""
    block = _render_recent_history([_row("Deadlift", 1, 140, 0), _row("Deadlift", 10, 80, 1)])
    assert "Deadlift: 140kg x1" in block


def test_history_survives_bodyweight_and_junk_rows():
    assert _render_recent_history([]) == ""
    assert _render_recent_history([{"exercise_name": "X", "reps": 5, "logged_at": None}]) == ""
    bodyweight = _render_recent_history(
        [{"exercise_name": "Push Up", "reps": 20, "weight": None, "logged_at": f"{date.today()}T10:00:00"}]
    )
    assert "Push Up 1x20" in bodyweight
    assert "bests:" not in bodyweight   # nothing to rank without a load


def test_history_stays_small_enough_to_send_every_turn():
    """It rides in the user turn, uncached, on voice turns too."""
    rows = [_row(f"Exercise {i}", 8, 40 + i, d) for d in range(20) for i in range(8)]
    block = _render_recent_history(rows)
    assert len(block.splitlines()) <= 25, block

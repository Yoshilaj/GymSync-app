"""
Progression maths — the double-progression rules, with no DB in sight.

These are the cases that decide what weight a user sees when they open a workout, so
each one is written as the training situation it represents rather than as a data shape.
"""
import pytest

from app.progression import (
    DELOAD_FRACTION,
    STALL_SESSIONS,
    estimate_1rm,
    increment_for,
    is_lower_body,
    last_performance,
    next_target,
    stall_verdict,
)


def sets(day: str, name: str, weight, reps, count=3, unit="kg"):
    """`count` identical sets of one lift on one day."""
    return [
        {
            "exercise_name": name,
            "weight": weight,
            "reps": reps,
            "weight_unit": unit,
            "logged_at": f"{day}T18:00:00+00:00",
        }
        for _ in range(count)
    ]


# ── 1RM + increments ──────────────────────────────────────────────────────────

def test_epley_ranks_a_heavy_single_above_a_light_set_of_ten():
    assert estimate_1rm(100, 1) > estimate_1rm(60, 10)


@pytest.mark.parametrize(
    "name,expected",
    [("Back Squat", True), ("Romanian Deadlift", True), ("Bench Press", False),
     ("Overhead Press", False), ("Walking Lunge", True), ("Barbell Row", False)],
)
def test_lower_body_detection_by_name(name, expected):
    assert is_lower_body(name) is expected


def test_movement_tag_beats_the_name_guess():
    # The catalog knows better than a substring search.
    assert is_lower_body("Belt Machine", movement="squat") is True
    assert is_lower_body("Hack Squat", movement="push") is False


def test_lower_body_jumps_are_double_the_upper_body_ones():
    assert increment_for("Back Squat", "kg") == 5.0
    assert increment_for("Bench Press", "kg") == 2.5
    assert increment_for("Back Squat", "lbs") == 10.0
    assert increment_for("Bench Press", "lbs") == 5.0


# ── Stall detection ───────────────────────────────────────────────────────────

def test_a_lift_with_too_little_history_is_unknown_not_stalled():
    rows = sets("2026-07-20", "Bench Press", 60, 8)
    assert stall_verdict(rows, "Bench Press") == "unknown"


def test_a_climbing_lift_is_progressing():
    rows = (
        sets("2026-07-28", "Bench Press", 65, 8)
        + sets("2026-07-24", "Bench Press", 62.5, 8)
        + sets("2026-07-20", "Bench Press", 60, 8)
    )
    assert stall_verdict(rows, "Bench Press") == "progressing"


def test_three_sessions_at_the_same_top_weight_is_a_stall():
    rows = (
        sets("2026-07-28", "Bench Press", 60, 8)
        + sets("2026-07-24", "Bench Press", 60, 7)
        + sets("2026-07-20", "Bench Press", 60, 6)
    )
    assert stall_verdict(rows, "Bench Press") == "stalled"


def test_a_stall_that_drags_on_becomes_a_deload():
    rows = []
    for day in ("2026-07-28", "2026-07-24", "2026-07-20", "2026-07-16"):
        rows += sets(day, "Bench Press", 60, 6)
    assert stall_verdict(rows, "Bench Press") == "deload"


def test_exercise_names_match_case_and_space_insensitively():
    rows = sets("2026-07-28", "  bench press ", 60, 8)
    assert next_target(rows, "Bench Press") is not None


# ── next_target ───────────────────────────────────────────────────────────────

def test_a_lift_never_logged_gets_no_guess():
    assert next_target(sets("2026-07-28", "Squat", 100, 5), "Bench Press") is None


def test_clearing_the_top_of_the_range_on_every_set_adds_weight():
    rows = sets("2026-07-28", "Bench Press", 60, 12)
    t = next_target(rows, "Bench Press", reps_low=8, reps_high=12)
    assert t["weight"] == 62.5          # upper body → 2.5kg
    assert t["reps"] == 8               # back to the bottom of the range
    assert "62.5" in t["rationale"]


def test_squats_jump_by_five_not_two_and_a_half():
    rows = sets("2026-07-28", "Back Squat", 100, 12)
    assert next_target(rows, "Back Squat", reps_low=8, reps_high=12)["weight"] == 105


def test_missing_the_top_of_the_range_holds_the_weight_and_adds_a_rep():
    rows = sets("2026-07-28", "Bench Press", 60, 9)
    t = next_target(rows, "Bench Press", reps_low=8, reps_high=12)
    assert t["weight"] == 60
    assert t["reps"] == 10


def test_one_failed_set_is_enough_to_hold_the_weight():
    # Two sets at 12, one at 9 — the range was NOT cleared.
    rows = sets("2026-07-28", "Bench Press", 60, 12, count=2)
    rows += sets("2026-07-28", "Bench Press", 60, 9, count=1)
    t = next_target(rows, "Bench Press", reps_low=8, reps_high=12)
    assert t["weight"] == 60


def test_a_long_stall_cuts_the_weight_back():
    rows = []
    for day in ("2026-07-28", "2026-07-24", "2026-07-20", "2026-07-16"):
        rows += sets(day, "Bench Press", 100, 8)
    t = next_target(rows, "Bench Press", reps_low=8, reps_high=12)
    assert t["verdict"] == "deload"
    assert t["weight"] == pytest.approx(100 * (1 - DELOAD_FRACTION), abs=2.5)
    assert t["weight"] < 100


def test_bodyweight_work_progresses_by_reps_with_no_weight():
    rows = sets("2026-07-28", "Pull Up", None, 8)
    t = next_target(rows, "Pull Up", reps_low=6, reps_high=12)
    assert t["weight"] is None
    assert t["reps"] == 9


def test_the_unit_the_user_logged_in_is_the_unit_they_get_back():
    rows = sets("2026-07-28", "Bench Press", 135, 12, unit="lbs")
    t = next_target(rows, "Bench Press", reps_low=8, reps_high=12)
    assert t["unit"] == "lbs"
    assert t["weight"] == 140          # lbs upper-body step


def test_only_the_most_recent_session_sets_the_target():
    rows = sets("2026-07-28", "Bench Press", 60, 8) + sets("2026-07-20", "Bench Press", 80, 12)
    # The older, heavier day must not win.
    assert next_target(rows, "Bench Press", reps_low=8, reps_high=12)["weight"] == 60


# ── last_performance ──────────────────────────────────────────────────────────

def test_last_performance_summarises_each_lift_once():
    rows = (
        sets("2026-07-28", "Bench Press", 60, 8)
        + sets("2026-07-28", "Back Squat", 100, 5)
        + sets("2026-07-20", "Bench Press", 55, 8)
    )
    out = last_performance(rows)
    assert out["bench press"]["weight"] == 60
    assert out["back squat"]["weight"] == 100
    assert set(out) == {"bench press", "back squat"}


def test_rows_with_unparseable_timestamps_are_skipped_not_crashed_on():
    rows = sets("2026-07-28", "Bench Press", 60, 8)
    rows.append({"exercise_name": "Bench Press", "weight": 999, "reps": 1, "logged_at": None})
    assert next_target(rows, "Bench Press", reps_low=8, reps_high=12)["weight"] == 60


def test_stall_constant_matches_what_the_prompt_tells_the_user():
    # personalities.py promises "has not moved in three sessions".
    assert STALL_SESSIONS == 3


# ── The <recent_history> tier split ───────────────────────────────────────────

def test_stall_analysis_is_premium_but_your_own_numbers_are_not():
    """Showing someone their bests is Free; telling them a lift is stuck is Premium.

    Free and Pro keep everything they had before this split — taking the digest away
    would be a downgrade, not a paywall.
    """
    from app.agents.core import _render_recent_history

    rows = []
    for day in ("2026-07-28", "2026-07-24", "2026-07-20"):
        rows += sets(day, "Bench Press", 60, 8)

    premium = _render_recent_history(rows, "premium")
    free = _render_recent_history(rows, "free")

    assert "stalled:" in premium
    assert "stalled:" not in free
    for block in (premium, free):
        assert "bests:" in block
        assert "last_sessions:" in block

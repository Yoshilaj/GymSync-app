"""Set addressing + session-state rendering + cross-turn tool notes (no DB).

_resolve_set_slot decides which completed_sets slot log_set writes ("the first
set" → correct slot 1); _render_current_sets grounds spoken ordinals in the
prompt; _summarize_tool builds the [actions: ...] history note.
"""
from app.agents.core import _render_current_sets, _render_session_state, _summarize_tool
from app.agents.tools import _resolve_set_slot


# ── _resolve_set_slot ─────────────────────────────────────────────────────────

def test_append_on_empty():
    assert _resolve_set_slot([], None) == (0, "logged")


def test_append_after_highest_not_count():
    # Manual UI logging can leave gaps (0, 2) — count-append would collide at 2.
    assert _resolve_set_slot([0, 2], None) == (3, "logged")


def test_append_sequential():
    assert _resolve_set_slot([0, 1], None) == (2, "logged")


def test_named_set_corrects_existing():
    assert _resolve_set_slot([0, 1, 2], 1) == (0, "corrected")


def test_named_set_fills_empty_slot():
    # "For the first set I did 60kg" before anything is logged → set 1, fresh.
    assert _resolve_set_slot([], 1) == (0, "logged")


def test_named_set_beyond_log_is_fresh():
    assert _resolve_set_slot([0], 3) == (2, "logged")


# ── _render_current_sets ──────────────────────────────────────────────────────

def _target(reps=8, high=12):
    return {"id": "s", "exerciseId": "ex", "targetReps": reps, "repsHigh": high}


def test_numbered_lines_by_set_index():
    rows = [
        {"set_index": 0, "reps": 5, "weight": 60, "weight_unit": "kg"},
        {"set_index": 2, "reps": 5, "weight": 65, "weight_unit": "kg"},
    ]
    lines = _render_current_sets([_target(), _target(), _target()], rows)
    assert lines[0] == "   set 1: 5@60kg — done"
    assert "not done" in lines[1] and "8-12" in lines[1]
    assert lines[2] == "   set 3: 5@65kg — done"


def test_legacy_rows_fall_back_sequentially():
    # Missing/duplicate set_index (pre-012 data) must not stack on one slot.
    rows = [
        {"set_index": None, "reps": 5},
        {"set_index": 0, "reps": 6},  # duplicate of slot 0 → next free slot
    ]
    lines = _render_current_sets([_target(), _target()], rows)
    assert lines[0].startswith("   set 1: 5")
    assert lines[1].startswith("   set 2: 6")


def test_bonus_sets_extend_past_plan():
    rows = [{"set_index": i, "reps": 8} for i in range(3)]
    lines = _render_current_sets([_target(), _target()], rows)
    assert len(lines) == 3
    assert lines[2].startswith("   set 3: 8")


def test_session_state_numbers_only_current_exercise():
    snapshot = {
        "today_workout_id": "w1",
        "workouts": [
            {
                "id": "w1",
                "title": "Push",
                "exercises": [
                    {"exercise_name": "Bench Press", "target_sets": [_target(), _target()]},
                    {"exercise_name": "Overhead Press", "target_sets": [_target(), _target()]},
                ],
            }
        ],
    }
    sets = [{"exercise_name": "Bench Press", "set_index": 0, "reps": 5, "weight": 60,
             "weight_unit": "kg"}]
    out = _render_session_state("Bench Press", {}, snapshot, sets)
    assert "set 1: 5@60kg — done" in out          # current exercise: numbered
    assert out.count("set 1:") == 1               # the other exercise: aggregate only
    assert "set_number" in out                    # footer teaches the ordinal rule


# ── _summarize_tool ───────────────────────────────────────────────────────────

def test_summarize_log_set():
    note = _summarize_tool(
        "log_set",
        {"exercise_name": "Bench Press", "reps": 5, "weight": 60, "weight_unit": "kg"},
        {"status": "set_logged", "set_number": 2},
    )
    assert note == "logged Bench Press set 2: 5@60kg"


def test_summarize_correction():
    note = _summarize_tool(
        "log_set",
        {"exercise_name": "Bench Press", "reps": 8, "set_number": 1},
        {"status": "set_corrected", "set_number": 1},
    )
    assert note == "corrected Bench Press set 1: 8"


def test_summarize_skips_reads():
    assert _summarize_tool("get_current_session_state", {}, {"exercises": []}) is None
    assert _summarize_tool("search_knowledge", {"q": "volume"}, {"passages": []}) is None


def test_summarize_error():
    assert _summarize_tool("log_set", {}, {"error": "No active session"}) == "log_set failed"

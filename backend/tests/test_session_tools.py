"""Unit tests for today-only plan surgery + exercise navigation (no DB).

_apply_changes_to_snapshot and _resolve_goto_target are deliberately pure so
"I'll only do 3 sets today" and "next exercise" logic is testable without
Supabase. Snapshot shape mirrors plan_store.build_plan_tree.
"""
import copy

from app.agents.tools import _apply_changes_to_snapshot, _resolve_goto_target


def _set(i: int, reps: int = 8, high: int | None = 12) -> dict:
    s = {"id": f"s{i}", "exerciseId": "ex-bench", "targetReps": reps, "weight": None}
    if high is not None:
        s["repsHigh"] = high
    return s


def _snapshot() -> dict:
    return {
        "plan_id": "p1",
        "today_workout_id": "w1",
        "workouts": [
            {
                "id": "w1",
                "day_label": "Mon",
                "title": "Push",
                "exercises": [
                    {
                        "exercise_id": "ex-bench",
                        "exercise_name": "Barbell Bench Press",
                        "sort_order": 0,
                        "target_sets": [_set(1), _set(2), _set(3), _set(4)],
                    },
                    {
                        "exercise_id": "ex-ohp",
                        "exercise_name": "Overhead Press",
                        "sort_order": 1,
                        "target_sets": [_set(5), _set(6), _set(7)],
                    },
                    {
                        "exercise_id": "ex-dip",
                        "exercise_name": "Dips",
                        "sort_order": 2,
                        "target_sets": [_set(8), _set(9), _set(10)],
                    },
                ],
            },
            {"id": "w2", "day_label": "Thu", "title": "Pull", "exercises": []},
        ],
    }


def _today(snap: dict) -> list[dict]:
    return snap["workouts"][0]["exercises"]


# ── _apply_changes_to_snapshot ────────────────────────────────────────────────

def test_adjust_shrinks_sets() -> None:
    snap = _snapshot()
    applied, unmatched = _apply_changes_to_snapshot(
        snap, [{"op": "adjust", "exercise_name": "bench press", "sets": 3}], {}, None
    )
    assert len(applied) == 1 and not unmatched
    assert len(_today(snap)[0]["target_sets"]) == 3


def test_adjust_floors_at_completed() -> None:
    snap = _snapshot()
    # User already did 4 sets of bench; "only 3" must not erase logged work.
    _apply_changes_to_snapshot(
        snap,
        [{"op": "adjust", "exercise_name": "Bench Press", "sets": 3}],
        {"Barbell Bench Press": 4},
        "Barbell Bench Press",
    )
    assert len(_today(snap)[0]["target_sets"]) == 4


def test_adjust_grows_by_cloning_last_set() -> None:
    snap = _snapshot()
    _apply_changes_to_snapshot(
        snap, [{"op": "adjust", "exercise_name": "Dips", "sets": 5}], {}, None
    )
    sets = _today(snap)[2]["target_sets"]
    assert len(sets) == 5
    assert sets[3]["targetReps"] == sets[2]["targetReps"]
    assert sets[3]["id"] != sets[4]["id"]  # cloned sets get distinct ids


def test_adjust_reps_only_retargets_remaining_sets() -> None:
    snap = _snapshot()
    _apply_changes_to_snapshot(
        snap,
        [{"op": "adjust", "exercise_name": "Overhead Press", "reps": 5}],
        {"Overhead Press": 1},  # first set already done at the old target
        None,
    )
    sets = _today(snap)[1]["target_sets"]
    assert sets[0]["targetReps"] == 8 and "repsHigh" in sets[0]
    assert all(s["targetReps"] == 5 and "repsHigh" not in s for s in sets[1:])


def test_remove_untouched_exercise_deletes_it() -> None:
    snap = _snapshot()
    _apply_changes_to_snapshot(
        snap, [{"op": "remove", "exercise_name": "Dips"}], {}, None
    )
    assert [e["exercise_name"] for e in _today(snap)] == [
        "Barbell Bench Press",
        "Overhead Press",
    ]


def test_remove_started_exercise_truncates_to_done() -> None:
    snap = _snapshot()
    _apply_changes_to_snapshot(
        snap,
        [{"op": "remove", "exercise_name": "bench"}],
        {"Barbell Bench Press": 2},
        None,
    )
    # Kept, but only the 2 completed sets remain → renders as DONE.
    assert len(_today(snap)[0]["target_sets"]) == 2


def test_replace_renames_and_clears_id() -> None:
    snap = _snapshot()
    _apply_changes_to_snapshot(
        snap,
        [{"op": "replace", "exercise_name": "Dips", "to_exercise": "Close-Grip Bench"}],
        {},
        None,
    )
    ex = _today(snap)[2]
    assert ex["exercise_name"] == "Close-Grip Bench"
    assert ex["exercise_id"] is None
    assert len(ex["target_sets"]) == 3  # sets preserved


def test_add_appends_with_defaults() -> None:
    snap = _snapshot()
    _apply_changes_to_snapshot(
        snap, [{"op": "add", "exercise_name": "Lateral Raise", "sets": 4, "reps": 15}], {}, None
    )
    ex = _today(snap)[3]
    assert ex["exercise_name"] == "Lateral Raise"
    assert len(ex["target_sets"]) == 4
    assert ex["target_sets"][0]["targetReps"] == 15


def test_unmatched_name_reported_snapshot_untouched() -> None:
    snap = _snapshot()
    before = copy.deepcopy(snap)
    applied, unmatched = _apply_changes_to_snapshot(
        snap, [{"op": "adjust", "exercise_name": "Leg Press", "sets": 2}], {}, None
    )
    assert not applied and unmatched == ["Leg Press"]
    assert snap == before


def test_no_today_workout_all_unmatched() -> None:
    snap = {"workouts": []}
    applied, unmatched = _apply_changes_to_snapshot(
        snap, [{"op": "adjust", "exercise_name": "Bench", "sets": 3}], {}, None
    )
    assert not applied and unmatched == ["Bench"]


# ── _resolve_goto_target ──────────────────────────────────────────────────────

def test_goto_next_from_current() -> None:
    res = _resolve_goto_target(_snapshot(), {}, "Barbell Bench Press", {}, None)
    assert res["name"] == "Overhead Press"
    assert res["error"] is None
    assert (res["position"], res["total"]) == (2, 3)


def test_goto_next_at_last_is_end_of_workout() -> None:
    res = _resolve_goto_target(_snapshot(), {}, "Dips", {}, None)
    assert res["name"] is None
    assert res["error"] == "end_of_workout"


def test_goto_null_current_snaps_to_first_unfinished() -> None:
    # Bench fully logged, OHP untouched → "next" means OHP itself.
    res = _resolve_goto_target(
        _snapshot(), {}, None, {"Barbell Bench Press": 4}, None
    )
    assert res["name"] == "Overhead Press"


def test_goto_named_backward_jump() -> None:
    res = _resolve_goto_target(_snapshot(), {}, "Dips", {}, "bench")
    assert res["name"] == "Barbell Bench Press"
    assert res["position"] == 1


def test_goto_unmatched_name_errors_with_list() -> None:
    res = _resolve_goto_target(_snapshot(), {}, "Dips", {}, "Leg Press")
    assert res["name"] is None
    assert "Leg Press" in res["error"]
    assert res["exercises"] == ["Barbell Bench Press", "Overhead Press", "Dips"]


def test_goto_honors_swap_rename() -> None:
    overrides = {"swaps": [{"from": "Overhead Press", "to": "Arnold Press"}]}
    res = _resolve_goto_target(
        _snapshot(), overrides, "Barbell Bench Press", {}, None
    )
    assert res["name"] == "Arnold Press"


def test_goto_added_exercise_reachable() -> None:
    overrides = {"added_exercises": ["Face Pulls"]}
    res = _resolve_goto_target(_snapshot(), overrides, "Dips", {}, None)
    assert res["name"] == "Face Pulls"
    assert res["total"] == 4


def test_goto_no_plan_errors() -> None:
    res = _resolve_goto_target(None, {}, None, {}, None)
    assert res["error"] == "No plan for this session."

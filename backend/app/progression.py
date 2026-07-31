"""
Progression — turning logged sets into what to do next.

Pure functions over `completed_sets` rows. No DB, no model, no I/O: the whole point is
that "add 2.5kg" is arithmetic on the user's own history, not something an LLM should be
inventing. Callers do the querying; this decides.

The scheme is **double progression**, the one that survives contact with real training:
hold the load until every set clears the top of the rep range, then add the smallest
increment the plates allow and drop back down the range. When the top set hasn't moved in
three sessions, that's a stall and the answer is a cut, not another attempt.

`estimate_1rm` lives here as the single copy — core.py and routers/progress.py both used
to carry their own.
"""
from collections import defaultdict
from datetime import datetime
from typing import Literal

# Smallest jump that's actually loadable. Upper-body lifts move in half the steps of
# lower-body ones — a 5kg jump on a press is a different ask than on a squat.
_INCREMENT_KG = {"upper": 2.5, "lower": 5.0}
_INCREMENT_LBS = {"upper": 5.0, "lower": 10.0}

# Name fragments that mean "this is a lower-body lift". Crude on purpose: the exercise
# catalog's `movement` tag is the real source, and callers that have it should pass it.
_LOWER_HINTS = (
    "squat", "deadlift", "lunge", "leg", "calf", "hip thrust", "glute", "hamstring",
    "rdl", "good morning", "step up", "split squat",
)

_LOWER_MOVEMENTS = {"hinge", "squat", "lunge"}

# Equal top weight across this many sessions of a lift = stalled. Three is the number the
# coach's prompt already quotes to the user, so the two must agree.
STALL_SESSIONS = 3

# How much to cut on a stall. A tenth is enough to break the plateau without erasing a
# month of work.
DELOAD_FRACTION = 0.10

Verdict = Literal["progressing", "stalled", "deload", "unknown"]


def estimate_1rm(weight: float, reps: int) -> float:
    """Epley estimated 1RM — ranks "best set" so 100x1 beats 60x10."""
    return weight * (1 + reps / 30)


def is_lower_body(exercise_name: str, movement: str | None = None) -> bool:
    if movement:
        return movement.lower() in _LOWER_MOVEMENTS
    name = exercise_name.lower()
    return any(hint in name for hint in _LOWER_HINTS)


def increment_for(exercise_name: str, unit: str, movement: str | None = None) -> float:
    table = _INCREMENT_LBS if (unit or "").lower() == "lbs" else _INCREMENT_KG
    return table["lower" if is_lower_body(exercise_name, movement) else "upper"]


def _day(row: dict):
    raw = row.get("logged_at")
    try:
        return datetime.fromisoformat(str(raw)).date()
    except (TypeError, ValueError):
        return None


def sessions_for(rows: list[dict], exercise_name: str) -> list[list[dict]]:
    """This lift's sets grouped by training day, newest day first."""
    target = exercise_name.strip().lower()
    by_day: dict[object, list[dict]] = defaultdict(list)
    for row in rows:
        if (row.get("exercise_name") or "").strip().lower() != target:
            continue
        day = _day(row)
        if day is not None:
            by_day[day].append(row)
    return [by_day[d] for d in sorted(by_day, reverse=True)]


def _top_weight(sets: list[dict]) -> float | None:
    weights = [float(s["weight"]) for s in sets if s.get("weight")]
    return max(weights) if weights else None


def stall_verdict(rows: list[dict], exercise_name: str) -> Verdict:
    """Has this lift moved lately?

    "stalled" means the top weight is identical across the last STALL_SESSIONS sessions.
    "deload" is the same thing gone on longer — the point at which repeating the load is
    no longer worth another try.
    """
    sessions = sessions_for(rows, exercise_name)
    tops = [t for t in (_top_weight(s) for s in sessions) if t is not None]
    if len(tops) < STALL_SESSIONS:
        return "unknown"
    window = tops[:STALL_SESSIONS]
    if len(set(window)) > 1:
        return "progressing"
    # Flat for the window — how much further back does it go?
    flat = 0
    for t in tops:
        if t != window[0]:
            break
        flat += 1
    return "deload" if flat > STALL_SESSIONS else "stalled"


def next_target(
    rows: list[dict],
    exercise_name: str,
    *,
    reps_low: int = 8,
    reps_high: int | None = None,
    movement: str | None = None,
) -> dict | None:
    """What to put on the bar next time, and why.

    Returns {weight, reps, unit, rationale, verdict}, or None when the lift has never
    been logged — a first-time exercise has nothing to progress from, and guessing a
    load for someone is worse than leaving the field empty.
    """
    sessions = sessions_for(rows, exercise_name)
    if not sessions:
        return None

    last = sessions[0]
    top = _top_weight(last)
    unit = next((s.get("weight_unit") for s in last if s.get("weight_unit")), "kg")
    ceiling = reps_high or reps_low
    verdict = stall_verdict(rows, exercise_name)

    if top is None:
        # Bodyweight or unloaded — progress by reps alone.
        best_reps = max((int(s["reps"]) for s in last if s.get("reps")), default=reps_low)
        return {
            "weight": None,
            "reps": min(best_reps + 1, ceiling) if best_reps < ceiling else ceiling,
            "unit": unit,
            "verdict": verdict,
            "rationale": "Bodyweight — add a rep.",
        }

    if verdict == "deload":
        cut = round(top * (1 - DELOAD_FRACTION) / 2.5) * 2.5
        return {
            "weight": cut or top,
            "reps": reps_low,
            "unit": unit,
            "verdict": verdict,
            "rationale": (
                f"{top:g}{unit} hasn't moved in {STALL_SESSIONS}+ sessions — "
                f"back off to {cut:g}{unit} and build again."
            ),
        }

    # Did every working set at the top weight clear the top of the range?
    top_sets = [s for s in last if s.get("weight") and float(s["weight"]) == top]
    cleared = bool(top_sets) and all(
        s.get("reps") is not None and int(s["reps"]) >= ceiling for s in top_sets
    )

    if cleared:
        step = increment_for(exercise_name, unit or "kg", movement)
        return {
            "weight": top + step,
            "reps": reps_low,
            "unit": unit,
            "verdict": verdict,
            "rationale": (
                f"Hit {ceiling} on every set at {top:g}{unit} — up to {top + step:g}{unit}."
            ),
        }

    best_reps = max((int(s["reps"]) for s in top_sets if s.get("reps")), default=reps_low)
    return {
        "weight": top,
        "reps": min(best_reps + 1, ceiling),
        "unit": unit,
        "verdict": verdict,
        "rationale": (
            f"Stay at {top:g}{unit} and chase {min(best_reps + 1, ceiling)} reps."
            if verdict != "stalled"
            else f"{top:g}{unit} for {STALL_SESSIONS} sessions — push the reps to {ceiling}."
        ),
    }


def last_performance(rows: list[dict]) -> dict[str, dict]:
    """Per-exercise summary of the most recent session: {name_lower: {weight, reps, unit}}.

    One pass over the rows, so seeding a whole plan costs one query rather than one per
    exercise.
    """
    out: dict[str, dict] = {}
    by_exercise: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        name = (row.get("exercise_name") or "").strip().lower()
        if name:
            by_exercise[name].append(row)

    for name, ex_rows in by_exercise.items():
        sessions = sessions_for(ex_rows, name)
        if not sessions:
            continue
        last = sessions[0]
        top = _top_weight(last)
        out[name] = {
            "weight": top,
            "reps": max((int(s["reps"]) for s in last if s.get("reps")), default=None),
            "unit": next((s.get("weight_unit") for s in last if s.get("weight_unit")), None),
        }
    return out

"""The catalog is a hard constraint on generated plans (see 016_catalog_sync.sql).

The bug these cover: a home-workout plan came back containing Glute Bridge,
Nordic Curl and Cossack Squat. The model hadn't invented them — they were real
seed rows the app's bundled catalog didn't carry, so they rendered as grey
placeholders with no illustration and no detail page. Two things had to change:
an exercise the app can't render must be rejected outright rather than saved as
free text, and a loaded lift must be prescribable unloaded so a home user's leg
day has somewhere to go at all.

The proposal tool runs against a stub that implements only the exercises read
it makes. Anonymous (pre-signup) contexts persist nothing, so no write path is
exercised and none is faked.
"""
import pytest

from app.agents.tools import (
    ToolContext,
    _as_prescribed,
    _match_exercise,
    _propose_workout_plan,
    _usable_equipment,
)

# A slice of the real catalog: two lifts with bodyweight identities, one
# without (a Leg Press is meaningless with no sled), one true bodyweight row.
CATALOG = [
    {
        "id": "ex-squat",
        "name": "Back Squat",
        "movement": "squat",
        "equipment": "Barbell",
        "bodyweight_name": "Bodyweight Squat",
    },
    {
        "id": "ex-hip-thrust",
        "name": "Barbell Hip Thrust",
        "movement": "hinge",
        "equipment": "Barbell",
        "bodyweight_name": "Bodyweight Hip Thrust",
    },
    {
        "id": "ex-leg-press",
        "name": "Leg Press",
        "movement": "squat",
        "equipment": "Machine",
        "bodyweight_name": None,
    },
    {
        "id": "ex-pushup",
        "name": "Push-Up",
        "movement": "push",
        "equipment": "Bodyweight",
        "bodyweight_name": None,
    },
]


class _StubDB:
    """Implements exactly the chain _load_catalog builds, and nothing else."""

    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def table(self, name: str) -> "_StubDB":
        assert name == "exercises", f"unexpected table read: {name}"
        return self

    def select(self, *_cols: str) -> "_StubDB":
        return self

    def eq(self, *_a, **_k) -> "_StubDB":
        return self

    def is_(self, *_a, **_k) -> "_StubDB":
        return self

    def or_(self, *_a, **_k) -> "_StubDB":
        return self

    async def execute(self):
        return type("R", (), {"data": list(self._rows)})()


def _ctx(equipment: list[str]) -> ToolContext:
    return ToolContext(
        user_id="",
        session_id=None,
        db=_StubDB(CATALOG),
        anonymous_profile={"equipment": equipment, "training_days": None},
    )


def _plan(*exercises: dict) -> dict:
    return {
        "name": "Home",
        "days": [{"day_label": "Mon", "title": "Legs", "exercises": list(exercises)}],
    }


def _ex(name: str, ex_id: str | None = None) -> dict:
    row = {"exercise_name": name, "sets": 3, "reps_low": 10}
    if ex_id:
        row["exercise_id"] = ex_id
    return row


# ── _match_exercise ───────────────────────────────────────────────────────────

def test_bodyweight_name_resolves_to_its_catalog_row():
    """The name we hand the model has to survive the round trip back."""
    assert _match_exercise(CATALOG, None, "Bodyweight Squat")["id"] == "ex-squat"


def test_exact_and_qualified_names_still_match():
    assert _match_exercise(CATALOG, None, "Back Squat")["id"] == "ex-squat"
    assert _match_exercise(CATALOG, None, "Barbell Back Squat")["id"] == "ex-squat"


def test_supplied_id_is_trusted_over_the_name():
    assert _match_exercise(CATALOG, "ex-pushup", "Back Squat")["id"] == "ex-pushup"


@pytest.mark.parametrize("name", ["Cossack Squat", "Nordic Curl", "Glute Bridge", ""])
def test_uncatalogued_names_do_not_match(name):
    """The three from the original bug report, plus the empty case. A near-miss
    must stay unmatched rather than resolve to a different exercise."""
    assert _match_exercise(CATALOG, None, name) is None


# ── equipment gating ──────────────────────────────────────────────────────────

def test_bodyweight_and_owned_equipment_are_usable():
    assert _usable_equipment(CATALOG[3], {"Bodyweight"})
    assert _usable_equipment(CATALOG[0], {"Barbell"})


def test_a_loaded_lift_is_usable_only_if_it_has_a_bodyweight_identity():
    assert _usable_equipment(CATALOG[0], {"Bodyweight"})       # Back Squat
    assert not _usable_equipment(CATALOG[2], {"Bodyweight"})   # Leg Press


def test_empty_equipment_filters_nothing():
    """A half-filled profile means 'unknown', not 'owns nothing'."""
    assert _usable_equipment(CATALOG[2], set())


def test_as_prescribed_renames_only_when_the_load_is_missing():
    assert _as_prescribed(CATALOG[0], {"Bodyweight"}) == ("Bodyweight Squat", "Bodyweight")
    assert _as_prescribed(CATALOG[0], {"Barbell"}) == ("Back Squat", "Barbell")
    assert _as_prescribed(CATALOG[0], set()) == ("Back Squat", "Barbell")


# ── _propose_workout_plan ─────────────────────────────────────────────────────

async def test_home_plan_renames_loaded_lifts_to_their_bodyweight_identity():
    result, actions = await _propose_workout_plan(
        _plan(_ex("Back Squat", "ex-squat"), _ex("Barbell Hip Thrust", "ex-hip-thrust")),
        _ctx(["Bodyweight"]),
    )
    assert result["status"] == "proposal_shown"
    named = [e["exercise_name"] for e in actions[0]["plan"]["days"][0]["exercises"]]
    assert named == ["Bodyweight Squat", "Bodyweight Hip Thrust"]
    # The id is untouched — that's what keeps the illustration and detail page.
    ids = [e["exercise_id"] for e in actions[0]["plan"]["days"][0]["exercises"]]
    assert ids == ["ex-squat", "ex-hip-thrust"]


async def test_gym_plan_keeps_the_loaded_names():
    result, actions = await _propose_workout_plan(
        _plan(_ex("Back Squat", "ex-squat")), _ctx(["Barbell", "Machine"])
    )
    assert result["status"] == "proposal_shown"
    assert actions[0]["plan"]["days"][0]["exercises"][0]["exercise_name"] == "Back Squat"


async def test_an_uncatalogued_exercise_is_rejected_not_saved_by_name():
    """The reported bug, in one assertion: this used to return a proposal with
    exercise_id = None and a warning nothing rendered."""
    result, actions = await _propose_workout_plan(
        _plan(_ex("Back Squat", "ex-squat"), _ex("Cossack Squat")), _ctx(["Bodyweight"])
    )
    assert "error" in result
    assert "Cossack Squat" in result["error"]
    assert actions == []


async def test_equipment_the_user_lacks_is_rejected_when_there_is_no_bodyweight_form():
    result, _ = await _propose_workout_plan(
        _plan(_ex("Leg Press", "ex-leg-press")), _ctx(["Bodyweight"])
    )
    assert "error" in result
    assert "Leg Press" in result["error"]


async def test_a_valid_home_plan_produces_no_warnings():
    """Substituting a bodyweight identity is intended behaviour. If it warned,
    every home plan would carry a warning and the signal would be worthless."""
    result, _ = await _propose_workout_plan(
        _plan(_ex("Back Squat", "ex-squat"), _ex("Push-Up", "ex-pushup")),
        _ctx(["Bodyweight"]),
    )
    assert result["warnings"] == []

"""Weights are stored in kilograms, always.

The bug this prevents: `completed_sets` used to store whatever unit the user
spoke, alongside a `weight_unit` column that nothing which aggregates ever read.
`progress_summary`'s PR check and the Epley 1RM series both compare raw `weight`
values, so 75 (kg) beat 165 (lbs) — the heavier lift ranked lower — and any user
who mixed units saw a Progress tab full of nonsense.

Found live: a set spoken as "75 kg" by a user whose app is in pounds was stored
correctly as kg and then displayed as 75 lbs.
"""
import pytest

from app.units import KG_PER_LB, format_weight, from_kg, to_kg


# ── to_kg ─────────────────────────────────────────────────────────────────────

def test_kg_passes_through():
    assert to_kg(75, "kg") == 75


def test_lbs_converts():
    assert to_kg(165, "lbs") == pytest.approx(74.84, abs=0.01)


@pytest.mark.parametrize("spelling", ["lb", "lbs", "LBS", "pound", "Pounds"])
def test_every_spelling_of_pounds_converts(spelling):
    """The model writes what it heard, and enum validation isn't guaranteed."""
    assert to_kg(100, spelling) == pytest.approx(45.36, abs=0.01)


def test_unknown_unit_is_treated_as_metric_not_scaled():
    """Guessing 'lbs' on an unrecognised unit would silently inflate a lift by
    2.2x. Treating it as already-canonical is the conservative failure."""
    assert to_kg(75, "stone") == 75
    assert to_kg(75, None) == 75
    assert to_kg(75, "") == 75


# ── round trip ────────────────────────────────────────────────────────────────

def test_round_trip_is_stable_enough_to_display():
    """A user logging 185 lbs must not see 184.9 after storage."""
    assert from_kg(to_kg(185, "lbs"), "lbs") == pytest.approx(185, abs=0.1)


def test_the_conversion_that_started_this():
    """75 kg is 165 lbs, not 75 lbs. That 2.2x gap is the whole bug."""
    stored = to_kg(75, "kg")
    assert from_kg(stored, "lbs") == pytest.approx(165.3, abs=0.1)


def test_exact_definition_not_an_approximation():
    assert KG_PER_LB == 0.45359237


# ── spoken confirmation ───────────────────────────────────────────────────────

def test_format_drops_trailing_zeros_because_it_is_spoken_aloud():
    """"seventy five point zero kilos" is not how anyone talks."""
    assert format_weight(75.0, "kg") == "75 kg"


def test_format_keeps_a_meaningful_decimal():
    assert format_weight(74.84, "lbs") == "165 lbs"
    assert format_weight(72.5, "kg") == "72.5 kg"


def test_format_labels_the_unit_it_converted_into():
    stored = to_kg(75, "kg")
    assert format_weight(stored, "kg") == "75 kg"
    assert "lbs" in format_weight(stored, "lbs")

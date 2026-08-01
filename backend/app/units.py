"""Weight conversion at the API boundary.

Everything the server stores is metric. `profiles.weight_kg` and
`body_weight_logs.weight_kg` already say so in their names;
`completed_sets.weight` now follows the same rule, and 017 enforces it.

The alternative — storing whatever unit the user happened to speak, alongside a
`weight_unit` column — is what shipped first, and it was quietly wrong. Nothing
in `progress.py` read that column: PR detection and the Epley 1RM chart compared
raw numbers, so "75" logged in kg outranked "165" logged in lbs despite being
the lighter lift. A per-row unit only works if *every* reader remembers to
normalise, and readers get added by people who never saw this file.

Canonical storage moves that from a convention nobody can enforce to an
invariant the database checks. Convert here, on the way in; format for display
on the way out (see src/lib/units.ts, which has done exactly this for
anthropometrics all along).
"""

KG_PER_LB = 0.45359237

Unit = str  # "kg" | "lbs"


def to_kg(weight: float, unit: Unit | None) -> float:
    """Normalise a user-facing weight to kilograms.

    `None` means metric — callers resolve the user's preference before calling,
    and an unknown unit is treated as kg rather than silently scaling by 2.2.
    """
    if unit and unit.lower() in ("lb", "lbs", "pound", "pounds"):
        return round(weight * KG_PER_LB, 2)
    return round(weight, 2)


def from_kg(weight_kg: float, unit: Unit | None) -> float:
    """Present a stored kilogram value in the user's unit."""
    if unit and unit.lower() in ("lb", "lbs", "pound", "pounds"):
        return round(weight_kg / KG_PER_LB, 1)
    return round(weight_kg, 1)


def format_weight(weight_kg: float, unit: Unit | None) -> str:
    """Short spoken/printed form, e.g. '165 lbs' or '75 kg'.

    Trailing '.0' is dropped: the coach says this out loud, and "seventy five
    point zero kilos" is not how anyone speaks.
    """
    value = from_kg(weight_kg, unit)
    label = "lbs" if unit and unit.lower().startswith(("lb", "pound")) else "kg"
    text = f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{text} {label}"

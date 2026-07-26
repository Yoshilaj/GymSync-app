"""
User profile — the onboarding data layer.

GET returns the row (or a synthesized default for accounts that predate the
signup upsert) plus an `onboarded` flag. PUT is a partial update; the moment
the required onboarding set is complete, `onboarded_at` stamps automatically.
Anthropometrics are canonical metric (height_cm / weight_kg) — `units` is the
DISPLAY preference; clients convert at the API boundary.
"""
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app.auth import get_current_user_id
from app.database import get_db

router = APIRouter(tags=["profile"])

Sex = Literal["male", "female"]
ActivityLevel = Literal["sedentary", "light", "moderate", "very_active", "athlete"]
Experience = Literal["beginner", "intermediate", "advanced"]
Units = Literal["lbs", "kg"]

# Fields that must be non-null (plus non-empty goals/equipment) before
# onboarded_at stamps. Everything plan generation + Mifflin-St Jeor needs —
# except `sex`, which stays optional ("prefer not to say"); the nutrition
# calculator asks for it later only if the user wants calorie targets.
REQUIRED_FOR_ONBOARDING = (
    "birth_year",
    "height_cm",
    "weight_kg",
    "activity_level",
    "experience",
    "training_days",
    "session_minutes",
)

_DEFAULT_PROFILE = {
    "display_name": None,
    "units": "lbs",
    "experience": None,
    "goals": [],
    "preferences": {},
    "sex": None,
    "birth_year": None,
    "height_cm": None,
    "weight_kg": None,
    "activity_level": None,
    "training_days": None,
    "session_minutes": None,
    "equipment": [],
    "onboarded_at": None,
}


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    units: Units | None = None
    experience: Experience | None = None
    goals: list[str] | None = None
    preferences: dict | None = None
    sex: Sex | None = None
    birth_year: int | None = Field(None, ge=1900, le=2100)
    height_cm: float | None = Field(None, ge=90, le=250)
    weight_kg: float | None = Field(None, ge=25, le=350)
    activity_level: ActivityLevel | None = None
    training_days: int | None = Field(None, ge=1, le=7)
    session_minutes: int | None = Field(None, ge=15, le=240)
    equipment: list[str] | None = None
    # Explicit gate: 422s with the missing fields if the set is incomplete.
    complete_onboarding: bool = False


def _missing_onboarding_fields(row: dict) -> list[str]:
    missing = [f for f in REQUIRED_FOR_ONBOARDING if row.get(f) is None]
    if not row.get("goals"):
        missing.append("goals")
    if not row.get("equipment"):
        missing.append("equipment")
    return missing


def _shape(row: dict) -> dict:
    return {
        "profile": {k: row.get(k, v) for k, v in _DEFAULT_PROFILE.items()},
        "onboarded": row.get("onboarded_at") is not None,
    }


@router.get("/profile")
async def get_profile(
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    res = await db.table("profiles").select("*").eq("user_id", user_id).execute()
    row = res.data[0] if res.data else dict(_DEFAULT_PROFILE)
    return _shape(row)


@router.put("/profile")
async def update_profile(
    body: ProfileUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> dict:
    patch = body.model_dump(exclude_unset=True, exclude={"complete_onboarding"})

    res = await db.table("profiles").select("*").eq("user_id", user_id).execute()
    current = res.data[0] if res.data else {"user_id": user_id, **_DEFAULT_PROFILE}
    merged = {**current, **patch}

    # Auto-stamp onboarded_at the moment the required set is complete.
    missing = _missing_onboarding_fields(merged)
    if merged.get("onboarded_at") is None and not missing:
        merged["onboarded_at"] = datetime.now(timezone.utc).isoformat()
    elif body.complete_onboarding and missing:
        raise HTTPException(
            status_code=422,
            detail=f"Onboarding incomplete — missing: {', '.join(missing)}",
        )

    merged["user_id"] = user_id
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()
    merged.pop("created_at", None)  # let the DB default own this

    saved = (
        await db.table("profiles")
        .upsert(merged, on_conflict="user_id")
        .execute()
    )
    return _shape(saved.data[0] if saved.data else merged)

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from supabase import AsyncClient

from app.agents.personalities import PRESETS, get_voice_id, list_presets
from app.agents.tools import utcnow
from app.auth import get_current_user_id
from app.database import get_db

router = APIRouter(tags=["personality"])


class PersonalityResponse(BaseModel):
    preset_id: str
    name: str
    voice_id: str
    available_presets: list[dict]


class PersonalityUpdate(BaseModel):
    preset_id: str


@router.get("/personality", response_model=PersonalityResponse)
async def get_personality(
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> PersonalityResponse:
    res = await db.table("personalities").select("preset_id").eq("user_id", user_id).execute()
    preset_id = res.data[0]["preset_id"] if res.data else "supportive"
    return PersonalityResponse(
        preset_id=preset_id,
        name=PRESETS.get(preset_id, PRESETS["supportive"])["name"],
        voice_id=get_voice_id(preset_id),
        available_presets=list_presets(),
    )


@router.put("/personality", response_model=PersonalityResponse)
async def update_personality(
    body: PersonalityUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> PersonalityResponse:
    if body.preset_id not in PRESETS:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Unknown preset_id: {body.preset_id}")

    await db.table("personalities").upsert(
        {"user_id": user_id, "preset_id": body.preset_id, "updated_at": utcnow()},
        on_conflict="user_id",
    ).execute()

    return PersonalityResponse(
        preset_id=body.preset_id,
        name=PRESETS[body.preset_id]["name"],
        voice_id=get_voice_id(body.preset_id),
        available_presets=list_presets(),
    )

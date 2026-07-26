"""
Account management — the destructive delete path.

Every user-owned table references auth.users ON DELETE CASCADE, so deleting the
auth user erases all their rows. Uses the service-role admin API.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from supabase import AsyncClient

from app.auth import get_current_user_id
from app.database import get_db

router = APIRouter(tags=["account"])
logger = logging.getLogger(__name__)


@router.delete("/account", status_code=204)
async def delete_account(
    user_id: str = Depends(get_current_user_id),
    db: AsyncClient = Depends(get_db),
) -> None:
    try:
        await db.auth.admin.delete_user(user_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Account deletion failed")
        raise HTTPException(status_code=500, detail="Could not delete account") from exc

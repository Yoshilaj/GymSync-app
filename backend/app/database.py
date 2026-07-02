from supabase import AsyncClient, acreate_client
from app.config import settings

_db: AsyncClient | None = None


async def init_db() -> None:
    global _db
    _db = await acreate_client(settings.supabase_url, settings.supabase_service_role_key)


async def close_db() -> None:
    # supabase-py's AsyncClient exposes no public close method, so there is
    # nothing to await; drop the reference and let its httpx sessions get GC'd.
    # Call aclose() defensively in case a future version adds one.
    global _db
    if _db is not None:
        aclose = getattr(_db, "aclose", None)
        if callable(aclose):
            await aclose()
        _db = None


async def get_db() -> AsyncClient:
    if _db is None:
        raise RuntimeError("Database not initialized — call init_db() during app startup")
    return _db

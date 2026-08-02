from supabase import AsyncClient, acreate_client
from app.config import settings

#AsyncClient: class that provides an asynchronous interface to interact with a Supabase database
    #be able to perform database operations (querying / inserting / updating / deleting) in an asynchronous manner
    #reason: this require non-blocking I/O operations

#acreate_client: function that creates an instance of AsyncClient

_db: AsyncClient | None = None


async def init_db() -> None:
    global _db
    _db = await acreate_client(
        settings.supabase_url,
        settings.supabase_service_role_key
        )
    #creates supabase client instance: allows backend to interact with the supabase database
    #wait until creation is finisehd -> store result in _db 

async def close_db() -> None:
    global _db
    if _db is not None:
        #AsyncClient itself has no close method; shut down its HTTP sub-clients instead
        await _db.postgrest.aclose()
        await _db.auth.close()
        _db = None

async def get_db() -> AsyncClient:
    if _db is None:
        raise RuntimeError("Database not initialized — call init_db() during app startup")
    return _db
    #gives _db to other parts of backend safely 
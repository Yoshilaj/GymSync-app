"""Ownership guard for client-supplied session ids.

The backend talks to Supabase with the service-role key (see `app/database.py`),
so PostgREST applies no row-level security to anything we do — the RLS policies in
`004_rls.sql` are defence-in-depth for other clients, not a filter on these queries.
Every handler is therefore solely responsible for proving that the row it is about
to touch belongs to the caller.

`session_id` is the one identifier the client hands us that isn't the token subject:
it arrives in the `POST /sets` body and in the voice socket's `session_start` frame,
and from there it flows into `ToolContext` and is used as a bare `.eq("id", ...)` by
a dozen agent tools. Validating it once at each boundary is what makes all of those
downstream reads safe, so call this the moment a session id crosses into the process.
"""

from fastapi import HTTPException
from supabase import AsyncClient


async def owns_session(session_id: str, user_id: str, db: AsyncClient) -> bool:
    """True when `session_id` exists and belongs to `user_id`."""
    res = (
        await db.table("workout_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(res.data)


async def assert_session_owner(session_id: str, user_id: str, db: AsyncClient) -> None:
    """Raise 404 unless `session_id` belongs to `user_id`.

    404 rather than 403 on purpose: a 403 would confirm that the session exists,
    which hands an attacker holding a guessed id the one bit they were missing.
    """
    if not await owns_session(session_id, user_id, db):
        raise HTTPException(status_code=404, detail="Session not found")

"""Email/password auth endpoints proxying Supabase GoTrue.

The app talks to these instead of Supabase directly so the backend stays the
single auth surface — when WorkOS (or another provider) lands, only this file
and the app-side auth API wrapper need to change.

IMPORTANT: these endpoints must NOT use the shared service-role client from
app.database. That client listens for auth events and would swap its
process-wide postgrest Authorization header to the signed-in user's token,
silently downgrading every later DB query from service-role. We use a
dedicated stateless GoTrue client with the anon key instead.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from supabase import AsyncClient
from supabase_auth import AsyncGoTrueClient
from supabase_auth.errors import AuthApiError, AuthWeakPasswordError

from app.config import settings
from app.database import get_db
from app.password import validate_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_auth: AsyncGoTrueClient | None = None


async def init_auth_client() -> None:
    global _auth
    _auth = AsyncGoTrueClient(
        url=f"{settings.supabase_url}/auth/v1",
        headers={
            "apikey": settings.supabase_anon_key,
            "Authorization": f"Bearer {settings.supabase_anon_key}",
        },
        auto_refresh_token=False,
        persist_session=False,  # in-memory only; we just read the returned tokens
    )


async def close_auth_client() -> None:
    global _auth
    if _auth is not None:
        await _auth.close()
        _auth = None


async def get_auth_client() -> AsyncGoTrueClient:
    if _auth is None:
        raise RuntimeError("Auth client not initialized — call init_auth_client() during app startup")
    return _auth


class SessionOut(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int | None = None


class UserOut(BaseModel):
    id: str
    email: str | None = None


class SignupRequest(BaseModel):
    email: EmailStr
    # No Field(min_length=...) on purpose: a pydantic failure returns a 422
    # whose `detail` is an ARRAY, and the app's error funnel only reads string
    # details — the user would get "Something went wrong." Password rules are
    # enforced in the endpoint instead, as a readable 400.
    password: str
    display_name: str | None = Field(default=None, max_length=80)


class SignupResponse(BaseModel):
    user: UserOut
    # None => Supabase requires the user to confirm their email before login.
    session: SessionOut | None = None
    email_confirmation_required: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    user: UserOut
    session: SessionOut


class ResetRequest(BaseModel):
    email: EmailStr


class ResetResponse(BaseModel):
    ok: bool = True
    message: str = "If an account exists for that email, a reset link has been sent."


def _map_auth_error(e: Exception) -> HTTPException:
    if isinstance(e, AuthWeakPasswordError):
        reasons = "; ".join(e.reasons) if getattr(e, "reasons", None) else ""
        detail = "Password is too weak." + (f" {reasons}" if reasons else "")
        return HTTPException(status_code=400, detail=detail)
    if isinstance(e, AuthApiError):
        code = e.code or ""
        if code == "invalid_credentials":
            return HTTPException(status_code=401, detail="Incorrect email or password.")
        if code == "email_not_confirmed":
            return HTTPException(status_code=403, detail="Please confirm your email, then sign in.")
        if code in ("user_already_exists", "email_exists"):
            return HTTPException(status_code=409, detail="An account with this email already exists.")
        if code == "weak_password":
            return HTTPException(status_code=400, detail="Password is too weak.")
        if code == "validation_failed":
            return HTTPException(status_code=400, detail=e.message)
        if "rate_limit" in code:
            return HTTPException(status_code=429, detail="Too many attempts. Try again shortly.")
        status = e.status if 400 <= (e.status or 0) < 500 else 502
        return HTTPException(status_code=status, detail=e.message)
    logger.exception("Unexpected auth error", exc_info=e)
    return HTTPException(status_code=502, detail="Auth service unavailable.")


def _session_out(session) -> SessionOut:
    return SessionOut(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
    )


@router.post("/signup", response_model=SignupResponse)
async def signup(
    body: SignupRequest,
    auth: AsyncGoTrueClient = Depends(get_auth_client),
    db: AsyncClient = Depends(get_db),
) -> SignupResponse:
    # Server-side authority for the rules the sign-up screen shows live.
    weak = validate_password(body.password, body.email, body.display_name)
    if weak:
        raise HTTPException(status_code=400, detail=weak)

    try:
        res = await auth.sign_up(
            {
                "email": body.email,
                "password": body.password,
                "options": {"data": {"display_name": body.display_name}},
            }
        )
    except Exception as e:
        raise _map_auth_error(e)

    if res.user is None:
        raise HTTPException(status_code=502, detail="Auth service unavailable.")

    # With email confirmation ON, GoTrue anti-enumeration returns a fake user
    # (no identities) for an already-registered email instead of erroring.
    if res.user.identities is not None and len(res.user.identities) == 0:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    # Seed the profile row now so the app never sees a user without one.
    # display_name also lives in user metadata, so a failure here is recoverable.
    try:
        await db.table("profiles").upsert(
            {"user_id": str(res.user.id), "display_name": body.display_name},
            on_conflict="user_id",
        ).execute()
    except Exception:
        logger.exception("Profile creation failed for user %s", res.user.id)

    return SignupResponse(
        user=UserOut(id=str(res.user.id), email=res.user.email),
        session=_session_out(res.session) if res.session else None,
        email_confirmation_required=res.session is None,
    )


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    auth: AsyncGoTrueClient = Depends(get_auth_client),
) -> LoginResponse:
    try:
        res = await auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception as e:
        raise _map_auth_error(e)

    if res.session is None or res.user is None:
        raise HTTPException(status_code=502, detail="Auth service unavailable.")

    return LoginResponse(
        user=UserOut(id=str(res.user.id), email=res.user.email),
        session=_session_out(res.session),
    )


@router.post("/reset-password", response_model=ResetResponse)
async def reset_password(
    body: ResetRequest,
    auth: AsyncGoTrueClient = Depends(get_auth_client),
) -> ResetResponse:
    try:
        await auth.reset_password_for_email(body.email)
    except AuthApiError as e:
        if "rate_limit" in (e.code or ""):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again shortly.")
        # Swallow other errors: the generic response prevents account enumeration.
        logger.info("Password reset request failed quietly: %s", e.message)
    except Exception:
        logger.exception("Password reset request failed")

    return ResetResponse()

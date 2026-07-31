"""Email/password auth endpoints proxying Supabase GoTrue.

The app talks to these instead of Supabase directly so the backend stays the
single auth surface, and so password rules are enforced somewhere a client can't
skip. Social sign-in (Apple/Google) is the deliberate exception: the ID-token
exchange has to happen on the device that holds the native credential.

IMPORTANT: these endpoints must NOT use the shared service-role client from
app.database. That client listens for auth events and would swap its
process-wide postgrest Authorization header to the signed-in user's token,
silently downgrading every later DB query from service-role. We use a
dedicated stateless GoTrue client with the anon key instead.

PASSWORD CHANGES COME IN TWO FLAVOURS, and the difference is what proves you may
make one:

  /change-password         — you know the current password. Re-checked here, not
                             just on the client, so a stolen access token alone
                             can't rotate the password out from under someone.
  /reset-password/confirm  — you proved you own the inbox. Recognised by the
                             session's `amr` being "otp" (verified empirically:
                             a recovery link mints amr=[{"method":"otp"}], a
                             normal login mints amr=[{"method":"password"}]).

Neither accepts a plain password session with no current password, which is the
account-takeover shape.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from supabase import AsyncClient
from supabase_auth import AsyncGoTrueClient
from supabase_auth.errors import AuthApiError, AuthWeakPasswordError

from app.auth import get_claims
from app.config import settings
from app.database import get_db
from app.jwt_verify import TokenClaims
from app.mfa_state import sync_from_factors
from app.password import validate_password
from app.ratelimit import check_only, client_ip, consume, enforce

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Where Supabase sends the user after they click an emailed link. The app's scheme
# is registered in app.json and this exact value is on the project's redirect
# allow-list; GoTrue silently falls back to SITE_URL for anything not on it.
AUTH_CALLBACK_URL = "gymsync://auth-callback"

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


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ConfirmResetRequest(BaseModel):
    new_password: str


class OkResponse(BaseModel):
    ok: bool = True


class MfaStateResponse(BaseModel):
    mfa_enabled: bool


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
    request: Request,
    body: SignupRequest,
    auth: AsyncGoTrueClient = Depends(get_auth_client),
    db: AsyncClient = Depends(get_db),
) -> SignupResponse:
    # Mass signup is both spam and a drain on the SMTP quota — every one of these
    # sends a confirmation email.
    enforce("signup_ip", client_ip(request))

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

    # Belt and braces. Migration 014 puts an on_auth_user_created trigger on
    # auth.users, which is what actually guarantees a profile row — it fires for
    # social sign-in too, which never reaches this endpoint. This upsert stays
    # because it costs nothing and covers the window before 014 is applied.
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
    request: Request,
    body: LoginRequest,
    auth: AsyncGoTrueClient = Depends(get_auth_client),
) -> LoginResponse:
    # Two budgets, checked but not yet spent. Per-email stops password guessing at
    # one account; per-IP stops a spray across many. Keeping them separate is what
    # prevents the limiter from becoming a lockout tool: hammering someone else's
    # address can't exhaust yours.
    ip = client_ip(request)
    email_key = body.email.strip().lower()
    check_only("login_email", email_key)
    check_only("login_ip", ip)

    try:
        res = await auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception as e:
        # Only failures cost budget. Charging successful sign-ins would rate-limit
        # an app that signs in on every cold start.
        consume("login_email", email_key)
        consume("login_ip", ip)
        raise _map_auth_error(e)

    if res.session is None or res.user is None:
        raise HTTPException(status_code=502, detail="Auth service unavailable.")

    return LoginResponse(
        user=UserOut(id=str(res.user.id), email=res.user.email),
        session=_session_out(res.session),
    )


@router.post("/reset-password", response_model=ResetResponse)
async def reset_password(
    request: Request,
    body: ResetRequest,
    auth: AsyncGoTrueClient = Depends(get_auth_client),
) -> ResetResponse:
    # Strict per address: without this, anyone can flood a stranger's inbox by
    # submitting their email on repeat.
    enforce("reset_email", body.email.strip().lower())
    enforce("reset_ip", client_ip(request))

    try:
        # Without redirect_to the link lands on Supabase's hosted page and the reset
        # dead-ends outside the app. With it, the user comes back to us holding a
        # recovery session — see /reset-password/confirm.
        await auth.reset_password_for_email(
            body.email, {"redirect_to": AUTH_CALLBACK_URL}
        )
    except AuthApiError as e:
        if "rate_limit" in (e.code or ""):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again shortly.")
        # Swallow other errors: the generic response prevents account enumeration.
        logger.info("Password reset request failed quietly: %s", e.message)
    except Exception:
        logger.exception("Password reset request failed")

    return ResetResponse()


async def _set_password(db: AsyncClient, user_id: str, password: str, email: str | None) -> None:
    """Apply the server-side rules, then write the new password via the admin API.

    The rules run HERE and not only on the client because `updateUser({password})`
    from the app bypassed them entirely — the sign-up blocklist would reject
    "gymsync123" while the change-password screen happily accepted it.
    """
    weak = validate_password(password, email)
    if weak:
        raise HTTPException(status_code=400, detail=weak)
    try:
        await db.auth.admin.update_user_by_id(user_id, {"password": password})
    except Exception as e:
        raise _map_auth_error(e)


@router.post("/change-password", response_model=OkResponse)
async def change_password(
    body: ChangePasswordRequest,
    claims: TokenClaims = Depends(get_claims),
    auth: AsyncGoTrueClient = Depends(get_auth_client),
    db: AsyncClient = Depends(get_db),
) -> OkResponse:
    """Change the password of a signed-in user who can produce the current one.

    The re-authentication used to happen only in the app (ChangePasswordScreen
    called signInWithPassword first). Anything a client does, a client can skip —
    so it happens here now, against the same stateless GoTrue client used for login.
    """
    # This endpoint verifies a password, so it is a guessing oracle like login is.
    enforce("password_change", claims.sub)

    if not claims.email:
        raise HTTPException(status_code=400, detail="This account has no email address.")

    try:
        await auth.sign_in_with_password(
            {"email": claims.email, "password": body.current_password}
        )
    except Exception:
        # Deliberately not _map_auth_error: every failure here is "wrong password"
        # as far as the caller is concerned, and the distinction leaks nothing useful.
        raise HTTPException(status_code=401, detail="Current password is incorrect.")

    if body.new_password == body.current_password:
        raise HTTPException(status_code=400, detail="That's your current password. Pick a new one.")

    await _set_password(db, claims.sub, body.new_password, claims.email)
    return OkResponse()


@router.post("/reset-password/confirm", response_model=OkResponse)
async def confirm_reset(
    body: ConfirmResetRequest,
    claims: TokenClaims = Depends(get_claims),
    db: AsyncClient = Depends(get_db),
) -> OkResponse:
    """Finish a password reset, authorised by the recovery session from the email link.

    There is no current password to check — the proof is that they opened a link sent
    to their inbox. What stops this from being "change anyone's password with any
    token" is the `amr` check: a session minted by a recovery link reports "otp",
    while an ordinary login reports "password". Refusing the latter means a stolen
    access token still cannot rotate the password without the current one.
    """
    enforce("password_change", claims.sub)

    if "otp" not in claims.amr:
        raise HTTPException(
            status_code=403,
            detail="Open the link from your password reset email to set a new password.",
        )
    await _set_password(db, claims.sub, body.new_password, claims.email)
    return OkResponse()


@router.post("/mfa/state", response_model=MfaStateResponse)
async def sync_mfa_state(
    claims: TokenClaims = Depends(get_claims),
    db: AsyncClient = Depends(get_db),
) -> MfaStateResponse:
    """Re-read the account's factor list and update profiles.mfa_enabled.

    Enrollment and unenrollment happen on the device (supabase-js `auth.mfa.*`),
    because those calls need a GoTrue client holding the user's own session and the
    stateless anon client here has none. That leaves the server needing to be told
    the state changed — but NOT to be told what the new state is. It looks the
    answer up itself through the admin API, since a client that could assert "I have
    no factors" could switch off its own second factor.
    """
    enforce("mfa_state", claims.sub)
    try:
        enabled = await sync_from_factors(db, claims.sub)
    except Exception:
        raise HTTPException(status_code=502, detail="Could not read your security settings.")
    return MfaStateResponse(mfa_enabled=enabled)

import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.billing.apple import validate_billing_settings
from app.config import settings
from app.database import close_db, init_db
from app.jwt_verify import warm_jwks
from app.routers import (
    account,
    auth,
    billing,
    conversations,
    personality,
    plans,
    profile,
    progress,
    session,
    voice_ws,
)
from app.routers.auth import close_auth_client, init_auth_client

#CORSMiddleware: controls which apps can access the API

# Uvicorn configures only its own loggers and leaves the root alone, so every
# `logging.getLogger("gymsync.…")` call in this app fell through to the stdlib's
# lastResort handler: WARNING and above, message text only, no level or name.
# That is why a voice session whose Deepgram connection died looked, from the
# console, exactly like one that was working — the restart notices are INFO.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s | %(message)s",
)
# The Deepgram SDK attaches its own handler; without this its records reach
# ours as well and every STT line prints twice.
logging.getLogger("deepgram").propagate = False
# httpx logs a line per request, and one voice turn makes several Supabase
# calls — left at INFO it buries the lines this config exists to surface.
logging.getLogger("httpx").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

# Crash reporting. Inert without a DSN, so local work and CI stay silent.
#
# send_default_pii stays off deliberately: on it, the SDK attaches request
# headers and cookies to every event, and this API's Authorization header is a
# live Supabase access token. An issue tracker is not where those belong.
if settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        send_default_pii=False,
        # Errors only, matching the client. Tracing the voice path would sample
        # every turn and spend quota we'd rather keep for crashes.
        traces_sample_rate=0.0,
    )
    logger.info("sentry enabled (env=%s)", settings.app_env)


def validate_scaling_settings() -> None:
    """Refuse to start if someone configured a shared store that doesn't exist.

    Rate limiting counts in a module-level dict (app/ratelimit.py), so it is only
    correct while this runs as a single process. The documented way out is Redis,
    and `RedisCache` in app/cache.py is still a stub that raises — so a REDIS_URL
    set in good faith buys nothing while looking like it bought everything. That
    is the dangerous combination: believing limits are shared is what makes it
    safe-seeming to add a second machine.

    Fail here, where the message can say so, rather than let signup and login
    budgets quietly multiply by the number of machines.
    """
    if settings.redis_url:
        raise RuntimeError(
            "REDIS_URL is set, but RedisCache is not implemented (app/cache.py). "
            "Rate limits are still per-process, so this process must stay the only "
            "one. Implement RedisCache before scaling out, or unset REDIS_URL."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Before anything else: refuse to start on a billing config that could hand
    # out paid access for free (unsigned Xcode transactions in production, a
    # Production environment with no App Store ID). A startup crash with a clear
    # message beats discovering it as an entitlement bug.
    validate_billing_settings()
    validate_scaling_settings()
    await init_db()
    await init_auth_client()
    # Pull the JWT signing keys now so the first authenticated request isn't the one
    # that pays for the fetch. Non-fatal: it retries on demand.
    await warm_jwks()
    yield
    await close_auth_client()
    await close_db()


# /docs, /redoc and /openapi.json are development tools, and FastAPI serves all
# three publicly by default. On a laptop that's free convenience; on the open
# internet it publishes the complete API surface — every route, every request
# shape — to anyone who asks, including POST /plans/generate-anonymous, the
# unauthenticated one that spends Anthropic tokens.
#
# This is not the security boundary; authorization and rate limiting are, and
# they don't depend on the schema being secret. But a native-only app has no use
# for a public schema, so there's nothing to weigh against handing out the map.
_expose_docs = settings.app_env != "production"

app = FastAPI(
    title="GymSync API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if _expose_docs else None,
    redoc_url="/redoc" if _expose_docs else None,
    # Without this the schema stays reachable even with the UIs switched off,
    # which is the whole thing we're closing.
    openapi_url="/openapi.json" if _expose_docs else None,
)

# CORS. The old setting was allow_origins=["*"] WITH allow_credentials=True — the
# combination browsers refuse for a reason: it invites any website to make
# credentialed calls to this API on a visitor's behalf.
#
# The app is native, and a React Native fetch sends no Origin header, so it is not
# subject to CORS at all — an empty allow-list costs the app nothing. Development
# keeps a permissive list because Expo web and the docs page are genuinely useful.
_cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
if not _cors_origins and settings.app_env != "production":
    _cors_origins = ["http://localhost:8081", "http://localhost:19006", "http://localhost:8000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    # Only meaningful alongside a real origin list. With none configured in
    # production this is inert, which is the intended resting state.
    allow_credentials=bool(_cors_origins),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last line of defence for anything a handler didn't catch.

    Starlette's default already withholds the traceback from the response, so this
    isn't closing a leak — it's making the failure *findable*. Every unhandled error
    now carries a short id that appears both in the log line and in the body, so a
    user can quote it in a support message and it lands on the exact stack trace.
    """
    error_id = uuid.uuid4().hex[:12]
    logger.exception(
        "unhandled error %s on %s %s", error_id, request.method, request.url.path
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Something went wrong on our end.",
            "error_id": error_id,
        },
    )


app.include_router(auth.router, prefix="/api")
app.include_router(personality.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(plans.router, prefix="/api")
app.include_router(account.router, prefix="/api")
app.include_router(progress.router, prefix="/api")
app.include_router(session.router, prefix="/api")
app.include_router(conversations.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(voice_ws.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.cache import build_cache
from app.config import settings
from app.database import close_db, init_db
from app.middleware import AccessLogMiddleware
from app.monitoring import logger
from app.ratelimit import limiter
from app.routers import chat, ops, personality, session, voice_ws
from app.runtime import set_cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Singletons, mirroring the existing database._db pattern.
    await init_db()
    set_cache(build_cache(settings.redis_url, settings.cache_ttl_s))
    logger.info("startup", extra={"extra_data": {"env": settings.app_env}})
    yield
    logger.info("shutdown", extra={"extra_data": {"env": settings.app_env}})
    await close_db()


app = FastAPI(title="GymSync API", version="0.1.0", lifespan=lifespan)

# slowapi wiring: the limiter needs to hang off app.state; 429s return a graceful JSON body.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(AccessLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your Expo origin in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ops probes (/health, /metrics, /cache-stats) are unprefixed for infra tooling.
app.include_router(ops.router)
app.include_router(personality.router, prefix="/api")
app.include_router(session.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(voice_ws.router)

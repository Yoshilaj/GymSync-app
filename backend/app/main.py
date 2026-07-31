from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware 

from app.billing.apple import validate_billing_settings
from app.database import close_db, init_db
from app.jwt_verify import warm_jwks
from app.routers import (
    account,
    auth,
    billing,
    chat,
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Before anything else: refuse to start on a billing config that could hand
    # out paid access for free (unsigned Xcode transactions in production, a
    # Production environment with no App Store ID). A startup crash with a clear
    # message beats discovering it as an entitlement bug.
    validate_billing_settings()
    await init_db()
    await init_auth_client()
    # Pull the JWT signing keys now so the first authenticated request isn't the one
    # that pays for the fetch. Non-fatal: it retries on demand.
    await warm_jwks()
    yield
    await close_auth_client()
    await close_db()


app = FastAPI(title="GymSync API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your Expo origin in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(personality.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(plans.router, prefix="/api")
app.include_router(account.router, prefix="/api")
app.include_router(progress.router, prefix="/api")
app.include_router(session.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(conversations.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(voice_ws.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}

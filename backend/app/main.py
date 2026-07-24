from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware 

from app.database import close_db, init_db
from app.routers import auth, chat, personality, session, voice_ws
from app.routers.auth import close_auth_client, init_auth_client

#CORSMiddleware: controls which apps can access the API

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await init_auth_client()
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
app.include_router(session.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(voice_ws.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ── Secrets (required; supplied via .env / environment, never hardcoded) ──────
    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    anthropic_api_key: str

    deepgram_api_key: str
    elevenlabs_api_key: str

    # ── Reliability ───────────────────────────────────────────────────────────────
    # SDK-level transient retries (429/5xx/connection) on request establishment,
    # plus a same-tier fallback model used by resilience.stream_with_resilience.
    max_retries: int = 2
    request_timeout_s: float = 30.0
    # Fallback for the FAST tier if the primary keeps failing pre-first-token.
    # (Reasoning-tier fallback is handled by the same helper with its own model arg.)
    model_fallback: str = "claude-haiku-4-5-20251001"

    # ── Performance / cache ───────────────────────────────────────────────────────
    # In-memory now; set redis_url to flip the Cache implementation later (multi-worker).
    redis_url: str | None = None
    cache_ttl_s: int = 300                 # generic short-lived entries
    knowledge_cache_ttl_s: int = 86_400    # static corpus → long TTL, bumped by corpus_version
    # Bump on re-ingest to invalidate all cached knowledge retrievals at once.
    knowledge_corpus_version: str = "v1"

    # ── Security ──────────────────────────────────────────────────────────────────
    # slowapi limit string, applied per user_id on HTTP endpoints.
    rate_limit: str = "30/minute"
    # Hand-rolled limiter for WebSocket turns (slowapi can't see WS).
    ws_rate_limit_per_min: int = 30

    # ── Observability ─────────────────────────────────────────────────────────────
    log_level: str = "INFO"
    langsmith_api_key: str | None = None
    langsmith_project: str = "gymsync"

    # App environment (health/probes; "production" tightens a few behaviors).
    app_env: str = "development"

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    """Singleton accessor — env is parsed once and reused everywhere."""
    return Settings()


# Module-level singleton kept for existing imports (`from app.config import settings`).
settings = get_settings()

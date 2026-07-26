from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str
    supabase_jwt_secret: str

    anthropic_api_key: str

    deepgram_api_key: str
    elevenlabs_api_key: str

    # TTS provider selection ("aura" | "elevenlabs"). The fallback is tried
    # when the primary fails; empty string = no fallback.
    tts_provider: str = "aura"
    tts_fallback_provider: str = ""

    # ── RAG serving (must match how the corpus was ingested: nomic 768-d, v2).
    # Defaults are the safe no-model-download modes; production .env sets
    # EMBEDDER=nomic and RERANKER=cross_encoder.
    embedder: str = "stub"                    # "stub" | "nomic"
    embedding_model: str = "nomic-ai/nomic-embed-text-v1.5"
    reranker: str = "identity"                # "identity" | "cross_encoder"
    reranker_model: str = "Xenova/ms-marco-MiniLM-L-6-v2"
    cache_ttl_s: int = 300
    knowledge_cache_ttl_s: int = 86_400
    knowledge_corpus_version: str = "v2"


settings = Settings()

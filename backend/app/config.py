from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

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


settings = Settings()

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str

    # Legacy symmetric signing secret. This project signs with ES256 asymmetric keys
    # published at /auth/v1/.well-known/jwks.json, so this is a ROLLBACK PATH ONLY —
    # app/jwt_verify.py uses it if a token ever arrives with an HS* algorithm. Empty
    # is the correct value on a project using asymmetric keys; it used to be required
    # at boot and read by nothing at all.
    supabase_jwt_secret: str = ""

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

    # ── Apple In-App Purchase ────────────────────────────────────────────────
    # Must match app.json's ios.bundleIdentifier exactly; Apple's verifier
    # rejects a transaction whose bundleId differs.
    apple_bundle_id: str = "com.yoshinishikawahara.gymsync"

    # The app's numeric App Store ID. Unknown until the app record exists, and
    # SignedDataVerifier REFUSES to construct a Production verifier without it
    # — so leaving this 0 is what correctly keeps Production unreachable today.
    apple_app_id: int = 0

    # Which environments a transaction may be verified against, tried in order.
    #
    # This list is the security boundary. It is NOT derived from the incoming
    # transaction: the payload carries its own `environment` field, and Apple's
    # library skips signature verification entirely for "Xcode"/"LocalTesting",
    # so trusting that field would let anyone POST an unsigned JWT claiming
    # Xcode and be handed Premium for life. See app/billing/apple.py.
    apple_environments: str = "Production,Sandbox"

    # Opt-in for the local .storekit simulator flow, where transactions are
    # signed by a local test certificate and CANNOT be cryptographically
    # verified. Startup refuses to boot if this is on while app_env is
    # "production" — see validate_billing_settings().
    apple_allow_local_testing: bool = False

    # Deployment marker. "development" | "production".
    app_env: str = "development"

    # ── Networking ───────────────────────────────────────────────────────────
    # Comma-separated origins allowed to call the API from a browser. Empty means
    # "no browser origins", which is correct for a native-only app — a React Native
    # fetch sends no Origin header and is unaffected by CORS. The old wildcard
    # combined with allow_credentials was the worst of both: it permits any site to
    # make credentialed calls.
    cors_origins: str = ""

    # Set ONLY when a proxy you control appends X-Forwarded-For (a load balancer,
    # Cloudflare, nginx). Left off, the header is ignored and rate limits key on the
    # socket address — because an attacker can otherwise set XFF to whatever they
    # like and get a fresh budget per request. See app/ratelimit.py.
    trusted_proxy: bool = False


settings = Settings()

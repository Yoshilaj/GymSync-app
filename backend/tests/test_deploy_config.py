"""The deployment files have to agree with the code they deploy.

None of this is checkable at runtime: if the Dockerfile bakes the wrong model
name, the image builds fine, the app boots fine, and the failure appears on the
first premium search in production as a several-hundred-megabyte download from
HuggingFace — or a timeout, if HuggingFace is unreachable. Same shape of problem
for the worker count: two workers silently double every rate limit rather than
breaking anything visibly.

So these read the deployment files as text and assert against the settings
defaults. Crude, and deliberately so — it fails when someone edits one side of
the pair, which is the only way this ever goes wrong.
"""
import tomllib
from pathlib import Path

import pytest

from app.config import Settings

BACKEND = Path(__file__).resolve().parent.parent
DOCKERFILE = BACKEND / "Dockerfile"
FLY_TOML = BACKEND / "fly.toml"

pytestmark = pytest.mark.skipif(
    not DOCKERFILE.exists(), reason="Dockerfile not present in this checkout"
)


@pytest.fixture(scope="module")
def dockerfile() -> str:
    return DOCKERFILE.read_text()


@pytest.fixture(scope="module")
def fly() -> dict:
    """Parsed, not string-matched.

    These assertions used to grep the file text and every one of them broke the
    first time `fly launch` touched it — flyctl rewrites the config it manages,
    normalising double quotes to single and `false` to `'off'`. None of that
    changed a setting; it just changed the spelling. Parse the TOML so the tests
    check what Fly will actually read.
    """
    if not FLY_TOML.exists():
        return {}
    return tomllib.loads(FLY_TOML.read_text())


def _default(field: str) -> str:
    return Settings.model_fields[field].default


def test_dockerfile_bakes_the_embedding_model_the_app_asks_for(dockerfile):
    model = _default("embedding_model")
    assert model in dockerfile, (
        f"Dockerfile doesn't pre-download {model!r}. The first premium search in "
        f"production would download it at runtime."
    )


def test_dockerfile_bakes_the_reranker_the_app_asks_for(dockerfile):
    model = _default("reranker_model")
    assert model in dockerfile, (
        f"Dockerfile doesn't pre-download {model!r}. The first rerank in production "
        f"would download it at runtime."
    )


def test_model_cache_path_is_pinned_and_matches_fly(dockerfile, fly):
    """fastembed defaults its cache to a temp dir, so the path must be explicit
    in both places or the baked models are written somewhere the app won't look."""
    assert "FASTEMBED_CACHE_PATH=/opt/models" in dockerfile
    if fly:
        assert fly["env"]["FASTEMBED_CACHE_PATH"] == "/opt/models"


def test_single_uvicorn_worker(dockerfile):
    """app/ratelimit.py counts in a module-level dict: N workers = N x every limit."""
    assert '"--workers", "1"' in dockerfile, (
        "The rate limiter is per-process. More than one worker multiplies every "
        "budget by the worker count — see the note in app/ratelimit.py."
    )


def test_production_enables_trusted_proxy(fly):
    """Off, client_ip() falls back to the socket address — which behind Fly is the
    proxy, so every caller shares one bucket."""
    if not fly:
        pytest.skip("no fly.toml")
    assert fly["env"]["TRUSTED_PROXY"] == "true"


def test_production_runs_as_production(fly):
    """APP_ENV gates the billing startup check that refuses locally-signed
    Apple transactions. Wrong here, and free Premium is one env var away."""
    if not fly:
        pytest.skip("no fly.toml")
    assert fly["env"]["APP_ENV"] == "production"


def test_production_sets_the_real_rag_backends(fly):
    """The Settings defaults are the no-download stubs; production must opt in,
    and must opt in to exactly what the image baked."""
    if not fly:
        pytest.skip("no fly.toml")
    assert fly["env"]["EMBEDDER"] == "nomic"
    assert fly["env"]["RERANKER"] == "cross_encoder"


def test_voice_machines_do_not_auto_stop(fly):
    """A machine that stops under an idle websocket drops a live voice session.

    flyctl accepts both the old boolean and the newer 'off' | 'stop' | 'suspend'
    form, and rewrites false to 'off' when it regenerates the file. Anything that
    isn't one of those two spellings of "don't" is a regression.
    """
    if not fly:
        pytest.skip("no fly.toml")
    value = fly["http_service"]["auto_stop_machines"]
    assert value in (False, "off"), f"machines may auto-stop: {value!r}"


def test_one_machine_stays_up(fly):
    """Paired with the single worker: the rate limiter is per-process, so the
    count of running machines IS the multiplier on every limit."""
    if not fly:
        pytest.skip("no fly.toml")
    assert fly["http_service"]["min_machines_running"] == 1


def test_memory_is_enough_for_the_onnx_models(fly):
    """256MB is the Fly default and is OOM-killed the first time a premium search
    loads the embedder and reranker."""
    if not fly:
        pytest.skip("no fly.toml")
    assert fly["vm"][0]["memory"] == "1gb"


def test_healthcheck_points_at_the_route_that_exists(fly):
    if not fly:
        pytest.skip("no fly.toml")
    paths = [c["path"] for c in fly["http_service"]["checks"]]
    assert "/health" in paths


# ── Would this config actually boot? ──────────────────────────────────────────

def test_flys_env_would_pass_the_billing_startup_check(fly, monkeypatch):
    """Run the real startup validator against the real deployed env block.

    This is the test that was missing. The first deploy crash-looped ten times
    and failed the release, because `apple_environments` defaults to
    'Production,Sandbox' and fly.toml didn't override it — so the process asked
    Apple for a Production verifier, which cannot be built without the numeric
    APPLE_APP_ID that doesn't exist until the App Store record does.

    Every individual setting looked right. The combination didn't, and nothing
    checked the combination until Fly did, in production, out loud.
    """
    if not fly:
        pytest.skip("no fly.toml")

    from app.billing import apple

    # _env_file=None is the whole point: the container has no .env, so every
    # field not in fly.toml takes its declared default. Reading the developer's
    # local .env here would have hidden this bug and invented a different one —
    # APPLE_ALLOW_LOCAL_TESTING is true locally and must never be true on Fly.
    deployed = Settings(
        _env_file=None,
        # Stand-ins for the six required secrets, which live in `fly secrets`.
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="x",
        supabase_anon_key="x",
        anthropic_api_key="x",
        deepgram_api_key="x",
        elevenlabs_api_key="x",
        **{k.lower(): v for k, v in fly["env"].items() if k.lower() in Settings.model_fields},
    )
    monkeypatch.setattr(apple, "settings", deployed)

    apple.validate_billing_settings()  # must not raise


def test_production_does_not_accept_unsigned_transactions(fly):
    """Sandbox and Production are signed; Xcode and LocalTesting are not. An
    unsigned environment here would hand out Premium to anyone who can POST."""
    if not fly:
        pytest.skip("no fly.toml")
    envs = fly["env"].get("APPLE_ENVIRONMENTS", "")
    assert "Xcode" not in envs and "LocalTesting" not in envs
    assert "APPLE_ALLOW_LOCAL_TESTING" not in fly["env"]


# ── The shared-store guard ────────────────────────────────────────────────────

def test_redis_url_is_a_declared_setting():
    """Undeclared, `extra="ignore"` would swallow it and the guard below could
    never fire — the exact silent no-op this pair exists to prevent."""
    assert "redis_url" in Settings.model_fields


def test_startup_refuses_a_redis_url_it_cannot_honour(monkeypatch):
    from app import main
    from app.config import settings

    monkeypatch.setattr(settings, "redis_url", "redis://localhost:6379", raising=False)
    with pytest.raises(RuntimeError, match="not implemented"):
        main.validate_scaling_settings()


def test_startup_is_happy_without_one(monkeypatch):
    from app import main
    from app.config import settings

    monkeypatch.setattr(settings, "redis_url", "", raising=False)
    main.validate_scaling_settings()  # must not raise

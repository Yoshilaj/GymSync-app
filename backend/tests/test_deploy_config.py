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
def fly() -> str:
    return FLY_TOML.read_text() if FLY_TOML.exists() else ""


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
        assert 'FASTEMBED_CACHE_PATH = "/opt/models"' in fly


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
    assert 'TRUSTED_PROXY = "true"' in fly


def test_production_sets_the_real_rag_backends(fly):
    """The Settings defaults are the no-download stubs; production must opt in,
    and must opt in to exactly what the image baked."""
    if not fly:
        pytest.skip("no fly.toml")
    assert 'EMBEDDER = "nomic"' in fly
    assert 'RERANKER = "cross_encoder"' in fly


def test_voice_machines_do_not_auto_stop(fly):
    """A machine that stops under an idle websocket drops a live voice session."""
    if not fly:
        pytest.skip("no fly.toml")
    assert "auto_stop_machines = false" in fly


def test_healthcheck_points_at_the_route_that_exists(fly):
    if not fly:
        pytest.skip("no fly.toml")
    assert 'path = "/health"' in fly


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

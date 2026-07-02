import pytest

from app import resilience
from app.resilience import stream_with_resilience


class _RetryErr(Exception):
    pass


class _FatalErr(Exception):
    pass


class _Final:
    stop_reason = "end_turn"
    usage = None


class FakeStream:
    """Mimics the Anthropic streaming context manager for the paths resilience uses."""

    def __init__(self, deltas, mode="ok", exc=None):
        self._deltas = deltas
        self._mode = mode          # "ok" | "establish_fail" | "midstream_fail"
        self._exc = exc

    async def __aenter__(self):
        if self._mode == "establish_fail":
            raise self._exc
        return self

    async def __aexit__(self, *exc):
        return False

    @property
    def text_stream(self):
        deltas, mode, exc = self._deltas, self._mode, self._exc

        async def gen():
            for i, d in enumerate(deltas):
                if mode == "midstream_fail" and i == 1:
                    raise exc
                yield d

        return gen()

    async def get_final_message(self):
        return _Final()


class FakeMessages:
    def __init__(self, plan):
        self._plan = plan          # model name -> zero-arg factory returning a FakeStream
        self.calls: list[str] = []

    def stream(self, *, model, **kwargs):
        self.calls.append(model)
        return self._plan[model]()


class FakeClient:
    def __init__(self, plan):
        self.messages = FakeMessages(plan)


@pytest.fixture(autouse=True)
def _no_backoff(monkeypatch):
    # Zero out sleep and treat _RetryErr as retryable regardless of the installed SDK.
    monkeypatch.setattr(resilience, "_backoff", lambda attempt: 0)
    monkeypatch.setattr(resilience, "_is_retryable", lambda exc: isinstance(exc, _RetryErr))


async def _collect(agen):
    out = []
    async for item in agen:
        out.append(item)
    return out


async def test_happy_path_yields_deltas_then_final():
    client = FakeClient({"m": lambda: FakeStream(["a", "b"])})
    events = await _collect(stream_with_resilience(client, models=["m"], max_retries=0))
    assert [e for e in events if e[0] == "delta"] == [("delta", "a"), ("delta", "b")]
    assert events[-1][0] == "final"


async def test_falls_back_to_next_model_before_first_token():
    client = FakeClient({
        "primary": lambda: FakeStream([], mode="establish_fail", exc=_RetryErr()),
        "fallback": lambda: FakeStream(["hi"]),
    })
    events = await _collect(
        stream_with_resilience(client, models=["primary", "fallback"], max_retries=0)
    )
    assert ("delta", "hi") in events
    assert client.messages.calls == ["primary", "fallback"]  # fallback was reached


async def test_midstream_failure_does_not_retry_or_double_emit():
    client = FakeClient({
        "primary": lambda: FakeStream(["a", "b", "c"], mode="midstream_fail", exc=_RetryErr()),
        "fallback": lambda: FakeStream(["should-not-run"]),
    })
    seen = []
    with pytest.raises(_RetryErr):
        async for ev in stream_with_resilience(client, models=["primary", "fallback"], max_retries=0):
            seen.append(ev)
    assert seen == [("delta", "a")]                 # only the pre-failure delta escaped
    assert client.messages.calls == ["primary"]     # no fallback after emitting


async def test_retries_same_model_with_backoff_before_first_token():
    # First establishment attempt fails transiently; the retry (max_retries=1) succeeds
    # on the SAME model, before any fallback is considered.
    attempts = {"n": 0}

    def factory():
        attempts["n"] += 1
        if attempts["n"] == 1:
            return FakeStream([], mode="establish_fail", exc=_RetryErr())
        return FakeStream(["ok"])

    client = FakeClient({"primary": factory, "fallback": lambda: FakeStream(["nope"])})
    events = await _collect(
        stream_with_resilience(client, models=["primary", "fallback"], max_retries=1)
    )
    assert ("delta", "ok") in events
    assert client.messages.calls == ["primary", "primary"]  # retried same model, no fallback


async def test_non_retryable_error_propagates_immediately():
    client = FakeClient({
        "primary": lambda: FakeStream([], mode="establish_fail", exc=_FatalErr()),
        "fallback": lambda: FakeStream(["nope"]),
    })
    with pytest.raises(_FatalErr):
        await _collect(stream_with_resilience(client, models=["primary", "fallback"], max_retries=0))
    assert client.messages.calls == ["primary"]     # no fallback on a fatal error

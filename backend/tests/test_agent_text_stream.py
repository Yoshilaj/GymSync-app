"""Assistant text either side of a tool call (no network, no DB).

The model emits one text block, calls a tool, then emits another. Those blocks
arrive with nothing between them, so they used to render fused:

    "What's today's workout? Let me pull up your plan.You're on Upper A — ..."

_agent_events now opens a paragraph at that seam. The Anthropic client and every
DB loader are monkeypatched, so the streaming loop runs exactly as in production.
"""
import asyncio

import pytest

import app.agents.core as core


# ── Fakes ─────────────────────────────────────────────────────────────────────

class _ToolUse:
    type = "tool_use"

    def __init__(self, name, id="tu1", input=None):
        self.name, self.id, self.input = name, id, (input or {})


class _Final:
    def __init__(self, stop_reason, content=()):
        self.stop_reason, self.content = stop_reason, list(content)


class _FakeStream:
    def __init__(self, chunks, final):
        self._chunks, self._final = chunks, final

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    @property
    def text_stream(self):
        async def gen():
            for chunk in self._chunks:
                yield chunk

        return gen()

    async def get_final_message(self):
        return self._final


class _FakeMessages:
    def __init__(self, rounds):
        self._rounds, self.calls = list(rounds), 0

    def stream(self, **kwargs):
        chunks, final = self._rounds[self.calls]
        self.calls += 1
        return _FakeStream(chunks, final)


class _FakeClient:
    def __init__(self, rounds):
        self.messages = _FakeMessages(rounds)


@pytest.fixture
def agent(monkeypatch):
    """Returns run(rounds) -> the text the client would have concatenated."""

    async def _noop_str(*a, **kw):
        return ""

    monkeypatch.setattr(core, "_load_personality", lambda *a, **kw: _personality())
    monkeypatch.setattr(core, "_load_history", lambda *a, **kw: _empty_list())
    monkeypatch.setattr(core, "_load_session_context", _noop_str)
    monkeypatch.setattr(core, "_load_profile_context", _noop_str)
    monkeypatch.setattr(core, "_load_recent_history", _noop_str)
    monkeypatch.setattr(core, "_save_history", _noop_str)
    monkeypatch.setattr(core, "blocks_to_dicts", lambda blocks: [])
    monkeypatch.setattr(core, "_summarize_tool", lambda *a, **kw: None)

    async def _fake_execute_tool(name, args, ctx):
        return {"ok": True}, []

    monkeypatch.setattr(core, "execute_tool", _fake_execute_tool)

    async def _personality():
        return {"preset_id": "energetic", "system_prompt_override": None}

    async def _empty_list():
        return []

    def run(rounds):
        monkeypatch.setattr(core, "_get_client", lambda: _FakeClient(rounds))

        async def _collect():
            out = []
            async for event in core._agent_events("hi", "s1", "u1", db=None):
                if event["type"] == "text_delta":
                    out.append(event["text"])
            return "".join(out)

        return asyncio.run(_collect())

    return run


# ── The bug ───────────────────────────────────────────────────────────────────

def test_text_across_a_tool_call_is_not_fused(agent):
    text = agent([
        (["What's today's workout? Let me pull up your plan."],
         _Final("tool_use", [_ToolUse("get_workout_plan")])),
        (["You're on Upper A — Barbell Bench Press, Rows."], _Final("end_turn")),
    ])
    assert "plan.You're" not in text
    assert "your plan.\n\nYou're on Upper A" in text


def test_the_seam_is_a_real_sentence_boundary_for_tts(agent):
    """voice.py splits on (?<=[.!?])\\s+ — with no whitespace after the period
    the boundary is invisible and the run-on goes to TTS as one segment."""
    from app.agents.voice import _SENTENCE_RE

    text = agent([
        (["Logged. Pulling up your plan."], _Final("tool_use", [_ToolUse("get_workout_plan")])),
        (["You're on Upper A."], _Final("end_turn")),
    ])
    assert len(_SENTENCE_RE.split(text.strip())) == 3


# ── Edge cases the break must not break ───────────────────────────────────────

def test_tool_only_round_leaves_no_dangling_blank_line(agent):
    """Text, then two tool rounds back to back, then text: exactly one break."""
    text = agent([
        (["On it."], _Final("tool_use", [_ToolUse("get_workout_plan")])),
        ([], _Final("tool_use", [_ToolUse("get_current_session_state", id="tu2")])),
        (["You're on Upper A."], _Final("end_turn")),
    ])
    assert text == "On it.\n\nYou're on Upper A."


def test_no_leading_break_when_the_turn_opens_with_a_tool(agent):
    text = agent([
        ([], _Final("tool_use", [_ToolUse("log_set")])),
        (["Logged. Set two of three."], _Final("end_turn")),
    ])
    assert text == "Logged. Set two of three."


def test_model_supplied_newlines_do_not_stack(agent):
    """The model sometimes opens the post-tool block with its own newlines."""
    text = agent([
        (["On it."], _Final("tool_use", [_ToolUse("get_workout_plan")])),
        (["\n\n", "  You're on Upper A."], _Final("end_turn")),
    ])
    assert text == "On it.\n\nYou're on Upper A."
    assert "\n\n\n" not in text


def test_single_round_turn_is_untouched(agent):
    text = agent([(["Logged.", " Set two of three."], _Final("end_turn"))])
    assert text == "Logged. Set two of three."

"""
Tier-filtered agent toolset, and the prompt that has to match it.

The failure this guards against is subtle: filter a tool out of the definitions
but leave the system prompt instructing the model to call it, and the model
tries, gets nothing back, and the turn stalls. The prompt and the tool list are
two halves of one contract.
"""
import pytest

from app.agents.personalities import DEFAULT_PRESET, PRESETS, build_system_prompt
from app.agents.tools import ESSENTIAL_TOOLS, TOOL_DEFINITIONS, tools_for_tier
from app.entitlements import PREMIUM_TOOLS

TIERS = ("free", "pro", "premium")


def tool_names(tier):
    return {t["name"] for t in tools_for_tier(tier)}


@pytest.mark.parametrize("tier", TIERS)
def test_prompt_never_names_a_tool_the_model_lacks(tier):
    """The invariant. If this fails, the agent stalls mid-turn."""
    prompt = build_system_prompt(DEFAULT_PRESET, tier=tier)
    available = tool_names(tier)
    for gated in PREMIUM_TOOLS:
        if gated not in available:
            assert gated not in prompt, (
                f"{tier} prompt instructs the model to call {gated}, which it isn't given"
            )


@pytest.mark.parametrize("preset_id", sorted(PRESETS))
def test_invariant_holds_for_every_personality(preset_id):
    """Presets carry their own prompt text and could reintroduce a gated tool."""
    prompt = build_system_prompt(preset_id, tier="free")
    available = tool_names("free")
    for gated in PREMIUM_TOOLS:
        if gated not in available:
            assert gated not in prompt


def test_premium_keeps_every_tool():
    assert len(tools_for_tier("premium")) == len(TOOL_DEFINITIONS)
    assert PREMIUM_TOOLS <= tool_names("premium")


@pytest.mark.parametrize("tier", ["free", "pro"])
def test_premium_tools_are_withheld_below_premium(tier):
    assert not (PREMIUM_TOOLS & tool_names(tier))


@pytest.mark.parametrize("tier", TIERS)
def test_onboarding_tools_survive_filtering(tier):
    """
    Plan generation runs through this same loop. Filtering these away would
    break onboarding for every free user — the app's first-run experience.
    """
    assert ESSENTIAL_TOOLS <= tool_names(tier)


@pytest.mark.parametrize("tier", TIERS)
def test_filtering_only_removes_gated_tools(tier):
    assert tool_names(tier) == {t["name"] for t in TOOL_DEFINITIONS} - (
        set() if tier == "premium" else PREMIUM_TOOLS
    )


def test_downgraded_rules_keep_the_behaviour():
    """
    Dropping the tool must not drop the duty of care: a free user reporting pain
    should still have it taken seriously, just not recorded via report_injury.
    """
    free_prompt = build_system_prompt(DEFAULT_PRESET, tier="free")
    assert "pain, soreness, a tweak, or an injury" in free_prompt
    assert "swap_exercise" in free_prompt
    # And it must not imply a source it can no longer consult.
    assert "cited passages" not in free_prompt


def test_custom_override_prompts_are_also_downgraded():
    """The override path skips preset text but keeps the shared rules."""
    prompt = build_system_prompt(DEFAULT_PRESET, custom_override="Be terse.", tier="free")
    for gated in PREMIUM_TOOLS:
        assert gated not in prompt


# ── Tier resolution fails closed ─────────────────────────────────────────────


async def test_tier_resolution_without_a_database_is_free():
    from app.agents.core import _resolve_tier

    assert await _resolve_tier("u1", None, None) == "free"


async def test_anonymous_generation_is_free():
    from app.agents.core import _resolve_tier

    assert await _resolve_tier("u1", object(), {"goals": []}) == "free"


async def test_tier_lookup_failure_denies_rather_than_grants():
    """
    A database hiccup must not hand Premium tools to everyone. Degrading a
    paying customer for the length of an outage is the acceptable failure;
    failing open is not.
    """
    from app.agents import core

    class Exploding:
        def table(self, *_a, **_k):
            raise RuntimeError("database is down")

    assert await core._resolve_tier("u1", Exploding(), None) == "free"

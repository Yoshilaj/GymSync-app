/**
 * Position-in-the-flow, derived rather than hardcoded.
 *
 * Screens used to carry `step={4}` and name their own successor, which made
 * reordering a rewrite. Now every screen just asks where it is and says
 * "next" — the registry decides what that means.
 */
import { useCallback, useMemo } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useOnboarding } from './OnboardingContext';
import { BUILDING_ROUTE, ONBOARDING_STEPS } from './steps';

type Nav = NativeStackNavigationProp<Record<string, object | undefined>>;

export function useStepFlow() {
  const nav = useNavigation<Nav>();
  const route = useRoute();
  const { draft, preAuth, saveProfileDraft, stashDraft } = useOnboarding();

  const visible = useMemo(
    () => ONBOARDING_STEPS.filter((s) => !s.isVisible || s.isVisible(draft)),
    [draft],
  );

  const index = visible.findIndex((s) => s.key === route.name);
  const step = index >= 0 ? visible[index] : undefined;
  const total = visible.length;
  const isLast = index === total - 1;

  /**
   * Advance. On the final step: authenticated runs persist the draft (without
   * the completion flag — the gate must stay put while the plan generates)
   * and continue to BuildingPlan; pre-auth runs stash the draft and hand off
   * to SignUp in the parent auth stack ('SignUp' isn't a route here, so the
   * navigate call bubbles up). `replace` is for interstitials that must not
   * sit in the back stack.
   */
  const goNext = useCallback(
    async (opts?: { replace?: boolean }) => {
      const next = visible[index + 1];
      if (next) {
        // Called as methods, not detached — navigation methods are bound to
        // the navigator and lose their receiver if pulled off the object.
        if (opts?.replace) nav.replace(next.key, next.params);
        else nav.navigate(next.key, next.params);
        return;
      }
      if (preAuth) {
        // Even a failed stash proceeds: the post-auth flow re-asks the
        // questions, and a storage error must never block account creation.
        await stashDraft();
        // A percentage beat before the account ask. Not `replace` — the
        // interstitial pops itself, so Back from SignUp returns HERE.
        nav.navigate('Preparing');
        return;
      }
      const saved = await saveProfileDraft();
      if (saved) nav.navigate(BUILDING_ROUTE);
    },
    [visible, index, nav, preAuth, stashDraft, saveProfileDraft],
  );

  const goBack = useCallback(() => {
    if (nav.canGoBack()) nav.goBack();
  }, [nav]);

  return {
    /** Undefined only if a screen renders outside the registry. */
    step,
    index,
    total,
    isFirst: index <= 0,
    isLast,
    optional: !!step?.optional,
    progress: total > 0 && index >= 0 ? (index + 1) / total : 0,
    /**
     * Where the bar sat on the previous step. Each screen mounts its own
     * ProgressBar, so there's nothing to tween from unless we hand it the
     * value it should appear to be moving away from.
     */
    prevProgress: total > 0 && index >= 0 ? index / total : 0,
    goNext,
    goBack,
  };
}

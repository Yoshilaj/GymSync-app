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
import { ONBOARDING_STEPS } from './steps';

type Nav = NativeStackNavigationProp<Record<string, object | undefined>>;

export function useStepFlow() {
  const nav = useNavigation<Nav>();
  const route = useRoute();
  const { draft, preAuth, preview, saveProfileDraft, stashDraft } = useOnboarding();

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
      if (preAuth || preview) {
        // Even a failed stash proceeds: the post-auth flow re-asks the
        // questions, and a storage error must never block account creation.
        // (Preview never stashes — a fake draft must not haunt a real signup.)
        if (!preview) await stashDraft();
        // The real plan builds here now, then reveals, then SignUp. Preview
        // walks the same two screens on stubbed data.
        nav.navigate('Preparing');
        return;
      }
      const saved = await saveProfileDraft();
      // Through the paywall, not around it. This branch is the post-auth mount:
      // answering the questions while already signed in. It used to go straight
      // to BuildingPlan, so anyone arriving this way reached the app having
      // never been asked to pay.
      //
      // That was survivable while the only route in was a legacy account with
      // no onboarded_at. It stopped being survivable when Apple/Google sign-in
      // went live: creating an account from the SIGN-IN screen leaves no
      // onboarding draft on disk, so RootGate mounts this bare stack — a brand
      // new user on a path that never showed a price.
      //
      // PricingOnboardingRoute replaces itself with BuildingPlan on both
      // purchase and skip, so the tail of the flow is identical either way.
      if (saved) nav.navigate('Pricing');
    },
    [visible, index, nav, preAuth, preview, stashDraft, saveProfileDraft],
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

/**
 * "Open the paywall" — from anywhere, in one call.
 *
 * The Pricing screen lives inside SettingsNavigator, which is nested under the
 * Progress tab (ProgressStack → Settings → Pricing). So a refusal raised on the
 * Sync tab or mid-workout has to cross two navigators to reach it. Every call
 * site doing that by hand would be four brittle lines repeated five times, and
 * each one would have to know where the paywall happens to live today.
 *
 * `highlight` is what makes the prompt land on the tier that actually solves
 * the customer's problem: a spent Pro voice allowance opens on Premium, not on
 * the plan they already pay for. The Pricing route has accepted this param all
 * along and nothing has ever passed it.
 */
import { useCallback } from 'react';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { PaidTierId } from '@/screens/pricing/catalog';
import type { UpgradeRequired } from './upgrade';

export function useUpgradePrompt() {
  const nav = useNavigation();

  return useCallback(
    (upgradeOrTier: UpgradeRequired | PaidTierId) => {
      const highlight =
        typeof upgradeOrTier === 'string' ? upgradeOrTier : upgradeOrTier.requiredTier;

      // Addressed from the root so it works identically from any tab. Nesting
      // the params mirrors the ProgressStack → Settings → Pricing shape.
      nav.dispatch(
        CommonActions.navigate({
          name: 'Progress',
          params: {
            screen: 'Settings',
            params: {
              screen: 'Pricing',
              params: { context: 'settings', highlight },
            },
          },
        }),
      );
    },
    [nav],
  );
}

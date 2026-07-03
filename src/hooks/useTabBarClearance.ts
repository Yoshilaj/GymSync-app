import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, spacing } from '@/theme';

/**
 * Bottom clearance under the floating tab bar.
 *
 * - `scroll`: padding for scrollable content — clears the bar itself (the FAB
 *   tip may graze a row mid-scroll, which is fine because it scrolls away).
 * - `pinned`: offset for UI fixed at the screen bottom (chat input) — must
 *   clear the FAB, which pokes TAB_FAB_OVERLAP above the bar's top edge.
 */
export function useTabBarClearance() {
  const insets = useSafeAreaInsets();
  const barBottom = Math.max(insets.bottom, layout.TAB_BAR_BOTTOM_MIN);
  const barTop = barBottom + layout.TAB_BAR_BASE_HEIGHT;
  return {
    scroll: barTop + spacing.lg,
    pinned: barTop + layout.TAB_FAB_OVERLAP + spacing.md,
  };
}

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, spacing } from '@/theme';

/**
 * Bottom clearance under the floating tab bar.
 *
 * - `scroll`: padding for scrollable content — clears the bar itself.
 * - `pinned`: offset for UI fixed at the screen bottom (chat input).
 */
export function useTabBarClearance() {
  const insets = useSafeAreaInsets();
  const barBottom = Math.max(insets.bottom, layout.TAB_BAR_BOTTOM_MIN);
  const barTop = barBottom + layout.TAB_BAR_BASE_HEIGHT;
  return {
    scroll: barTop + spacing.lg,
    pinned: barTop + spacing.md,
  };
}

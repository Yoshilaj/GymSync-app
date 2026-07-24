import { spacing, radius } from './spacing';

/** Shared layout constants — the single home for former magic numbers. */
export const layout = {
  /** Uniform horizontal gutter for every screen. */
  SCREEN_H_PADDING: spacing.lg,
  /** Floating tab bar pill: content height. */
  TAB_BAR_BASE_HEIGHT: 64,
  /** Floating tab bar pill: horizontal inset from screen edges. */
  TAB_BAR_H_INSET: spacing.lg,
  /** Floating tab bar pill: minimum gap to the screen bottom when there is no safe-area inset. */
  TAB_BAR_BOTTOM_MIN: spacing.md,
  /** Floating tab bar pill: corner radius (pill ends on a 64pt bar). */
  TAB_BAR_RADIUS: radius.xxl,
  /** Center FAB diameter — sits level with the other tabs inside the bar. */
  TAB_FAB_SIZE: 54,
  /** KeyboardAvoidingView offset under the app header. */
  HEADER_KEYBOARD_OFFSET: 86,
} as const;

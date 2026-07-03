/**
 * Gradient stops for expo-linear-gradient. Typed as tuples because
 * LinearGradient's `colors` prop requires at least two entries.
 */
export const gradients = {
  /** FAB, workout hero card, LiveWorkoutStart. */
  brand: ['#4FB0FF', '#2E90EA', '#1A6BC0'] as const,
  /**
   * Primary Button fill. Bottom-weighted toward blue-700 so white labels
   * average ~3.9:1 — the deliberate premium-brand trade-off over solid
   * #1D77CE strict AA.
   */
  button: ['#2E90EA', '#1A6BC0'] as const,
  /** LiveWorkoutStart background wash. */
  screenWash: ['#E9F4FF', '#EEF3FA', '#EEF3FA'] as const,
  /** Area fill under line charts. */
  chartFill: ['rgba(46,144,234,0.18)', 'rgba(46,144,234,0.0)'] as const,
};

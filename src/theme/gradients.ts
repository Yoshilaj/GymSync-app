/**
 * Gradient stops for expo-linear-gradient. Typed as tuples (≥2 entries) so the
 * `colors` prop is satisfied. Theme-aware: `gradients` stays the LIGHT set for
 * unmigrated files; migrated files read `useTheme().gradients`.
 */
export type GradientStops = readonly [string, string, ...string[]];

export const lightGradients = {
  /** FAB, workout hero card, LiveWorkoutStart. */
  brand: ['#4FB0FF', '#2E90EA', '#1A6BC0'],
  /**
   * Primary Button fill. Bottom-weighted toward blue-700 so white labels
   * average ~3.9:1 — the deliberate premium-brand trade-off.
   */
  button: ['#2E90EA', '#1A6BC0'],
  /** LiveWorkoutStart background wash. */
  screenWash: ['#E9F4FF', '#EEF3FA', '#EEF3FA'],
  /** Area fill under line charts. */
  chartFill: ['rgba(46,144,234,0.18)', 'rgba(46,144,234,0.0)'],
  /** RestDayCard — deep twilight blue, the calm counterpart to `brand`. */
  rest: ['#1D77CE', '#14528F', '#0B2447'],
  /** Milestone/PR post tiles on the Profile grid. */
  navyDeep: ['#22405F', '#0B2447'],
  /** Bottom scrim for legible text over imagery (post tiles). */
  scrim: ['rgba(11,36,71,0)', 'rgba(11,36,71,0.62)'],
} as const satisfies Record<string, GradientStops>;

export type GradientKey = keyof typeof lightGradients;

export const darkGradients = {
  brand: ['#4FB0FF', '#2E90EA', '#1A6BC0'], // brand identity kept
  button: ['#2E90EA', '#1A6BC0'],
  screenWash: ['#0F2036', '#0B1220', '#0B1220'],
  chartFill: ['rgba(61,155,239,0.22)', 'rgba(61,155,239,0.0)'],
  rest: ['#14528F', '#0E2A47', '#070D18'],
  navyDeep: ['#1A2C42', '#070D18'],
  scrim: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.66)'],
} as const satisfies Record<GradientKey, GradientStops>;

/** Legacy export = light set. */
export const gradients = lightGradients;

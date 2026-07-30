import { ViewStyle } from 'react-native';
import { palette } from './palette';

export type ShadowPreset = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOpacity' | 'shadowRadius' | 'shadowOffset' | 'elevation'
>;

/**
 * Elevation presets. Light shadows are navy-tinted (pure black looks dirty on
 * the blue background). On dark, shadows barely read, so they go pure-black at
 * higher opacity and cards additionally carry a hairline border for elevation.
 *
 * `shadows` (below) stays exported as the LIGHT set for unmigrated files;
 * migrated files read `useTheme().shadows`.
 */
export const lightShadows = {
  /** Chips, list rows, AI chat bubble. */
  xs: {
    shadowColor: palette.navy[900],
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  /** Default Card. */
  sm: {
    shadowColor: palette.navy[900],
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  /** Hero cards, floating input bars, rest-timer pill. */
  md: {
    shadowColor: palette.navy[900],
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  /** Modals, tab bar. */
  lg: {
    shadowColor: palette.navy[900],
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  /** FAB, primary Button, active day capsule. */
  glow: {
    shadowColor: palette.blue[500],
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  /**
   * A halo that fades out instead of ending. `glow` is tuned for a pill on a
   * plain background, where its tight falloff reads as a crisp lift; under a
   * wide card it stacks up just below the edge and draws a visible blue line.
   * Wider radius, lower opacity — same light, no seam.
   */
  glowSoft: {
    shadowColor: palette.blue[500],
    shadowOpacity: 0.26,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  /** Active (listening) VoiceButton. */
  glowLive: {
    shadowColor: palette.orange[500],
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const satisfies Record<string, ShadowPreset>;

export type ShadowKey = keyof typeof lightShadows;

export const darkShadows: Record<ShadowKey, ShadowPreset> = {
  xs: { shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  sm: { shadowColor: '#000000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  md: { shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  lg: { shadowColor: '#000000', shadowOpacity: 0.55, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 10 },
  glow: { shadowColor: '#2E90EA', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  glowSoft: { shadowColor: '#2E90EA', shadowOpacity: 0.34, shadowRadius: 26, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  glowLive: { shadowColor: '#FF7A45', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
};

/** Legacy export = light set. */
export const shadows = lightShadows;

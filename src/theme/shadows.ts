import { ViewStyle } from 'react-native';
import { palette } from './palette';

type ShadowPreset = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOpacity' | 'shadowRadius' | 'shadowOffset' | 'elevation'
>;

/**
 * Elevation presets — navy-tinted (pure black looks dirty on the blue-tinted
 * background). Each bundles iOS shadow + Android elevation.
 *
 * Depth language: cards get shadow + white bg, no border.
 */
export const shadows = {
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
  /** Active (listening) VoiceButton. */
  glowLive: {
    shadowColor: palette.orange[500],
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const satisfies Record<string, ShadowPreset>;

export type ShadowKey = keyof typeof shadows;

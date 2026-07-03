import { palette } from './palette';

/**
 * Semantic color tokens.
 *
 * Rules the design system relies on:
 * - Cards are white + shadow, no border. Borders are for inputs and separators.
 * - Text never uses raw `accent` (#2E90EA is 3.3:1 on white — graphics only);
 *   blue text uses `accentText` (#1D77CE, 4.58:1, passes AA).
 * - `textTertiary` is restricted to placeholders and disabled states.
 * - Orange (`live`) is the exclusive live-audio / hot-streak signal.
 */
export const colors = {
  // Surfaces
  bg: palette.navy[100],
  bgSubtle: palette.navy[50],
  card: palette.white,
  sunken: palette.navy[200],

  // Borders
  border: palette.navy[300],
  borderStrong: palette.navy[400],

  // Accent
  accent: palette.blue[500],
  accentPressed: palette.blue[600],
  accentText: palette.blue[600],
  accentSoft: palette.blue[100],
  accentFaint: palette.blue[50],

  // Status
  success: palette.green[500],
  successText: palette.green[600],
  successSoft: palette.green[100],
  warning: palette.amber[500],
  warningText: palette.amber[700],
  warningSoft: palette.amber[100],
  danger: palette.red[500],
  dangerText: palette.red[600],
  dangerSoft: palette.red[100],

  // Live / voice
  live: palette.orange[500],
  liveText: palette.orange[600],
  liveSoft: palette.orange[100],

  // Text
  textPrimary: palette.navy[900],
  textSecondary: palette.navy[700],
  textTertiary: palette.navy[600],
  textInverse: palette.white,
} as const;

export type ColorKey = keyof typeof colors;

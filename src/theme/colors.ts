import { palette } from './palette';

/**
 * Semantic color tokens — now theme-aware (light + dark).
 *
 * Rules the design system relies on:
 * - Light cards are white + shadow, no border. Dark cards add a hairline
 *   `borderStrong` for elevation (shadows barely read on dark).
 * - Text never uses raw `accent` (graphics only); blue text uses `accentText`.
 * - `textTertiary` is restricted to placeholders and disabled states.
 * - Orange (`live`) is the exclusive live-audio / hot-streak signal.
 *
 * `colors` (below) stays exported as the LIGHT palette so any file not yet
 * migrated to `useTheme()` keeps compiling and renders light. Migrated files
 * read the active palette from `useTheme().colors`.
 */
export const lightColors = {
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

  // Translucent white chrome for controls sitting ON the brand/accent fills
  // (back pills, progress tracks, icon wells). Scheme-invariant — it overlays
  // the fixed brand blue, not a surface.
  onBrandOverlay: 'rgba(255,255,255,0.18)',

  // The dim behind a modal dialog. Navy-tinted rather than black, to match the
  // shadow language — a neutral black scrim goes grey over these blue-tinted
  // surfaces instead of reading as shade.
  scrimOverlay: 'rgba(11,36,71,0.45)',
} as const;

export type ColorKey = keyof typeof lightColors;

/**
 * Dark palette — a proper dark theme, not an inversion. Dark-navy surfaces
 * that get lighter with elevation, brand blue kept (graphic accent stays
 * vivid; accentText brightened to pass AA on dark), status/live tones tuned
 * for dark, white text preserved on saturated fills.
 */
export const darkColors: Record<ColorKey, string> = {
  // Surfaces (elevation = lighter)
  bg: '#0B1220',
  bgSubtle: '#0F1A2B',
  card: '#16233A',
  sunken: '#070D18',

  // Borders (subtle; carry elevation since shadows barely read)
  border: '#26344A',
  borderStrong: '#35465F',

  // Accent
  accent: '#3D9BEF',
  accentPressed: '#2E90EA',
  accentText: '#6BB4F5',
  accentSoft: '#16324F',
  accentFaint: '#122840',

  // Status
  success: '#2FBE77',
  successText: '#4ADE97',
  successSoft: '#10281D',
  warning: '#F0B23C',
  warningText: '#FFCE73',
  warningSoft: '#2A2210',
  danger: '#F26363',
  dangerText: '#FF8C8C',
  dangerSoft: '#2C1414',

  // Live / voice
  live: '#FF7A45',
  liveText: '#FF9E70',
  liveSoft: '#2E1810',

  // Text
  textPrimary: '#F2F6FC',
  textSecondary: '#A9B8CE',
  textTertiary: '#6B7C96',
  textInverse: '#FFFFFF',

  // On-brand chrome (see light note — deliberately scheme-invariant)
  onBrandOverlay: 'rgba(255,255,255,0.18)',

  // Deeper on dark: the dialog behind it is already dark, so the scrim has to
  // do more work to separate the two planes.
  scrimOverlay: 'rgba(0,0,0,0.6)',
};

/** Legacy export = light palette (unmigrated files keep working). */
export const colors = lightColors;

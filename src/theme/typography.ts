import { TextStyle } from 'react-native';
import type { ColorKey } from './colors';

/**
 * Inter is loaded as static files, so each weight is its own fontFamily.
 * Never combine these with a `fontWeight` style — Android would swap in the
 * system font and fake-bold it.
 */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * The type scale — font metrics only. Color is NOT baked in (it would freeze
 * to light); each variant's default color token lives in `variantColorToken`
 * and is resolved against the active theme by AppText. Screens consume these
 * through `<AppText variant="...">`, never RN's Text directly.
 */
// Scale note: Inter's x-height runs large, so Inter 16 reads like the HIG's
// 17pt SF body. Line heights target 1.4–1.5×.
export const textVariants = {
  display: { fontFamily: font.extrabold, fontSize: 34, lineHeight: 41, letterSpacing: -0.8 },
  h1: { fontFamily: font.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  h2: { fontFamily: font.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  h3: { fontFamily: font.semibold, fontSize: 18, lineHeight: 25, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: font.medium, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: font.medium, fontSize: 13, lineHeight: 19 },
  // Eyebrow labels: lighter weight + wider tracking reads precise, not shouty.
  label: {
    fontFamily: font.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  button: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: 0.1 },
  statSm: { fontFamily: font.bold, fontSize: 20, lineHeight: 24, letterSpacing: -0.3, ...tabular },
  stat: { fontFamily: font.extrabold, fontSize: 28, lineHeight: 32, letterSpacing: -0.8, ...tabular },
  statLg: { fontFamily: font.extrabold, fontSize: 40, lineHeight: 44, letterSpacing: -1.0, ...tabular },
  timer: { fontFamily: font.bold, fontSize: 48, lineHeight: 52, letterSpacing: -0.5, ...tabular },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof textVariants;

/** Each variant's default color token, resolved against the active theme. */
export const variantColorToken: Record<TextVariant, ColorKey> = {
  display: 'textPrimary',
  h1: 'textPrimary',
  h2: 'textPrimary',
  h3: 'textPrimary',
  body: 'textPrimary',
  bodyMedium: 'textPrimary',
  caption: 'textSecondary',
  label: 'textSecondary',
  button: 'textPrimary',
  statSm: 'textPrimary',
  stat: 'textPrimary',
  statLg: 'textPrimary',
  timer: 'textPrimary',
};

import { TextStyle } from 'react-native';
import { colors } from './colors';

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
 * The type scale. Screens consume these through `<AppText variant="...">`,
 * never by importing react-native's Text directly.
 */
// Scale note: Inter's x-height runs large, so Inter 16 reads like the HIG's
// 17pt SF body. Line heights target 1.4–1.5×.
export const textVariants = {
  display: {
    fontFamily: font.extrabold,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -0.8,
    color: colors.textPrimary,
  },
  h1: {
    fontFamily: font.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  h2: {
    fontFamily: font.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  h3: {
    fontFamily: font.semibold,
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  body: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  bodyMedium: {
    fontFamily: font.medium,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  caption: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  // Eyebrow labels: lighter weight + wider tracking reads precise, not shouty.
  label: {
    fontFamily: font.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  button: {
    fontFamily: font.semibold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0.1,
    color: colors.textPrimary,
  },
  statSm: {
    fontFamily: font.bold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
    color: colors.textPrimary,
    ...tabular,
  },
  stat: {
    fontFamily: font.extrabold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.8,
    color: colors.textPrimary,
    ...tabular,
  },
  statLg: {
    fontFamily: font.extrabold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.0,
    color: colors.textPrimary,
    ...tabular,
  },
  timer: {
    fontFamily: font.bold,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -0.5,
    color: colors.textPrimary,
    ...tabular,
  },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof textVariants;

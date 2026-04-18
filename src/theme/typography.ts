import { TextStyle } from 'react-native';
import { colors } from './colors';

export const typography: Record<string, TextStyle> = {
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text,
    lineHeight: 22,
  },
  bodyMuted: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.textMuted,
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  stat: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.8,
  },
};

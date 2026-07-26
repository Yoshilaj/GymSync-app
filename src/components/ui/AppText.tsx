import { Text, TextProps, TextStyle } from 'react-native';
import {
  textVariants,
  variantColorToken,
  useTheme,
  type ColorKey,
  type TextVariant,
} from '@/theme';

interface Props extends TextProps {
  variant?: TextVariant;
  /** A theme color token name (preferred) or a raw color string. */
  color?: ColorKey | (string & {});
  align?: TextStyle['textAlign'];
}

/**
 * The only Text the app renders. Variants own font family/size; the color is
 * resolved from the ACTIVE theme (a token by default, or the passed override)
 * so every AppText flips with light/dark automatically.
 */
export function AppText({
  variant = 'body',
  color,
  align,
  style,
  ...rest
}: Props) {
  const { colors } = useTheme();
  const base = colors[variantColorToken[variant]];
  const resolved =
    color != null ? (color in colors ? colors[color as ColorKey] : color) : base;
  return (
    <Text
      // Cap OS text scaling so fixed-height chrome (tab bar, day strip)
      // can't shatter; full Dynamic Type support is a later project.
      maxFontSizeMultiplier={1.2}
      {...rest}
      style={[
        textVariants[variant],
        { color: resolved },
        align != null && { textAlign: align },
        style,
      ]}
    />
  );
}

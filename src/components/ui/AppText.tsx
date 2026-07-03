import { Text, TextProps, TextStyle } from 'react-native';
import { colors, textVariants, ColorKey, TextVariant } from '@/theme';

interface Props extends TextProps {
  variant?: TextVariant;
  /** A theme color token name (preferred) or a raw color string. */
  color?: ColorKey | (string & {});
  align?: TextStyle['textAlign'];
}

/**
 * The only Text the app renders. Variants own font family, size, and default
 * color so screens can't drift back to hardcoded type styles.
 */
export function AppText({
  variant = 'body',
  color,
  align,
  style,
  ...rest
}: Props) {
  const resolved =
    color && color in colors ? colors[color as ColorKey] : color;
  return (
    <Text
      // Cap OS text scaling so fixed-height chrome (tab bar, day strip)
      // can't shatter; full Dynamic Type support is a later project.
      maxFontSizeMultiplier={1.2}
      {...rest}
      style={[
        textVariants[variant],
        resolved != null && { color: resolved },
        align != null && { textAlign: align },
        style,
      ]}
    />
  );
}

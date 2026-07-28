/**
 * The GymSync mark.
 *
 * This is the app icon's own artwork, not a redraw — `assets/logo-mark.png` is
 * keyed out of `assets/icon.png` so the glyph is identical to what ships on the
 * home screen. The key runs on saturation rather than brightness: the tile is
 * saturated blue and the glyph is white with grey shading, so a brightness
 * threshold would eat the shaded bevels while a saturation one keeps the mark
 * solid. Regenerate with `node tools/extract-logo-mark.js` if the icon changes.
 *
 * The asset is pure white on transparent, so `tintColor` recolours it cleanly
 * to whatever surface it lands on — accent on light, `textInverse` on brand.
 */
import { Image } from 'react-native';
import { useTheme } from '@/theme';

interface Props {
  size?: number;
  /** Defaults to the brand accent; pass `textInverse` on brand-filled surfaces. */
  color?: string;
}

export function Logo({ size = 96, color }: Props) {
  const { colors } = useTheme();

  return (
    <Image
      source={require('../../assets/logo-mark.png')}
      style={{ width: size, height: size, tintColor: color ?? colors.accent }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="GymSync"
    />
  );
}

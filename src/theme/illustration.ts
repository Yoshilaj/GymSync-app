/**
 * Palettes for drawn artwork — illustration, not UI.
 *
 * These live apart from `colors` deliberately. A semantic token answers "what
 * role does this play in the interface"; an illustration ramp answers "what
 * does this picture look like", and the two shouldn't be able to drift into
 * each other. Nothing here may be used for text, controls, or surfaces.
 *
 * The shape mirrors the paywall hero's layer stack ("limb + glint" — see
 * PaywallHero): a sky, a two-stage atmosphere bloom, the planet's limb, one
 * crisp glint line, and hairline orbit arcs. Light is a pale dawn; dark
 * inverts the logic rather than the values — deep sky, *brighter* light
 * source, because on dark surfaces light means near.
 *
 * There is exactly one light source and it sits on the horizon. Nothing here
 * lights the mark from behind: a glow centred on the glyph turned it into a
 * sticker floating over the picture instead of an object standing in it.
 */
import { palette } from './palette';

/** A paint with its own alpha — SVG stops want the two separately. */
export interface IllustrationStop {
  color: string;
  opacity: number;
}

export interface IllustrationPalette {
  /** Sky behind everything: top → bottom. Bottom MUST equal the page `bg`. */
  sky: readonly [string, string];
  /**
   * Wide atmosphere halo rising off the horizon (outer stop). The sun is
   * behind the limb, so this is the whole light source — and the only layer
   * that animates.
   */
  bloom: IllustrationStop;
  /** The bloom's mid stop — the eased middle that prevents banding. */
  bloomMid: IllustrationStop;
  /** The planet's surface: crest → page bg at the band's bottom edge. */
  limb: readonly [string, string];
  /** The crisp specular line on the crest — the one sharp element. */
  glint: IllustrationStop;
  /** Hairline orbit arcs (per-arc opacity lives in the composition). */
  arc: string;
  /**
   * The mark, tinted and bare on the corona — no disc behind it.
   * Deep enough to hold against the light on light, bright enough on dark.
   */
  mark: string;
}

export const lightIllustration: IllustrationPalette = {
  sky: [palette.white, palette.navy[100]],
  bloom: { color: palette.blue[200], opacity: 0.62 },
  bloomMid: { color: palette.blue[100], opacity: 0.3 },
  limb: [palette.blue[200], palette.navy[100]],
  glint: { color: palette.blue[400], opacity: 0.9 },
  arc: palette.blue[400],
  mark: palette.blue[700],
};

export const darkIllustration: IllustrationPalette = {
  sky: ['#16233A', '#0B1220'],
  bloom: { color: '#1A6BC0', opacity: 0.55 },
  bloomMid: { color: '#14528F', opacity: 0.26 },
  limb: ['#122840', '#0B1220'],
  glint: { color: '#FFFFFF', opacity: 0.35 },
  arc: '#4FB0FF',
  mark: '#8AC4F4',
};

/**
 * The paywall's media band — "limb + glint".
 *
 * A planetary-limb sunrise: one huge curve rising from the bottom of the band,
 * one crisp specular line along its crest, and a soft atmosphere breathing off
 * the horizon behind it. One centre of gravity — every arc is concentric with
 * the limb — and exactly one sharp element (the glint); everything else stays
 * blur-soft. That discipline is what separates this from the flat-bands
 * version it replaces.
 *
 * The mark stands *on* the picture, not in a glow of its own. An earlier pass
 * lit a radial corona behind the glyph; it read as a blurred sticker pasted
 * over the sky and fought the horizon for the eye. With it gone there is one
 * light source, low and behind the limb, exactly as the composition claims —
 * and the mark separates on tint and shape alone, which is enough.
 *
 * All geometry is computed at runtime from the rendered width/height rather
 * than scaled through a viewBox — the glass tier control overlaps this band's
 * bottom edge, so the crest's position in real points has to be exact.
 *
 * The atmosphere is the only thing that moves: its *wrapper View* (never SVG
 * props — those animate on the JS thread) breathes at 5s, the RestDayCard
 * NightSky cadence, and parks static under Reduce Motion.
 *
 * Everything is vector and theme-aware: zero assets, crisp at any density,
 * re-lit for dark mode by `theme/illustration.ts` (deep sky, brighter horizon
 * — the composition's best case).
 */
import { useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { AppText } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { layout, makeStyles, spacing, useTheme } from '@/theme';

/**
 * How far above the band's bottom edge the limb's crest sits. The glass tier
 * control dips into the bottom of the band, so anything lower would hide the
 * horizon behind it — that dip is TRACK_HEIGHT/4 ≈ 13pt, and this has to clear
 * it. At 34 the glint reads ~21pt above the pill: tight, but the pill is what
 * the horizon is supposed to be meeting.
 *
 * It came down from 44 to buy sky. Everything the lockup needs — a real gap
 * under the status bar, the mark, the heading, and clearance above the glint —
 * has to fit between the safe area and this line, and at 44 there wasn't room
 * for all four. Raising the band's own height would have been the other way to
 * pay for it, but the page is budgeted to render without scrolling and there
 * was nothing spare (see HERO_RATIO in PricingScreen).
 */
const CREST_INSET = 34;
/**
 * The mark, bare on the sky — no disc and no glow behind it.
 *
 * A container made it a badge sitting on the sky rather than a thing standing
 * in it; a corona made it a blur. Tinted and unboxed, it belongs to the
 * artwork, and its own silhouette is all the separation it needs.
 *
 * 48 rather than 56 for the same reason the crest moved: it's the cheapest 8pt
 * in the lockup. At h1 the heading is the louder half anyway, and the mark
 * stopped competing with it on the way down.
 */
const MARK = 48;
/**
 * The air above the mark, measured from the safe area — a fixed gap rather than
 * a share of whatever is left over.
 *
 * The lockup used to centre in the sky, which on a short band left the mark
 * ~10pt under the status bar and looking pinned to the top of the screen. The
 * gap under the chrome is the thing being designed, so it's the thing held
 * constant; the slack goes to the bottom, where a few points more or less of
 * sky above the crest costs nothing.
 */
const LOCKUP_TOP_GAP = spacing.xl;
/** Orbit arcs: offset from the limb radius and their fading opacities. */
const ARCS: readonly { offset: number; opacity: number }[] = [
  { offset: 28, opacity: 0.2 },
  { offset: 56, opacity: 0.13 },
  { offset: 88, opacity: 0.07 },
];

interface Props {
  /** Rendered height in points. */
  height: number;
  /** The line under the mark. Short — it shares the sky with the artwork. */
  title?: string;
}

export function PaywallHero({ height: h, title }: Props) {
  const { illustration: ill } = useTheme();
  const { width: w } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();

  const crestY = h - CREST_INSET;
  // Radius ≈ 1.6× the width: at phone scale the crest reads as a planet's
  // horizon — one huge curve — rather than a dome.
  const limbR = 1.6 * w;
  const limbCx = w / 2;
  const limbCy = crestY + limbR;

  const breathe = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    breathe.value = withRepeat(
      withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(breathe);
  }, [reduceMotion, breathe]);

  // Barely-registered amplitude, on purpose: ambience, not decoration.
  //
  // The swell has to pivot on the horizon, not on the layer's centre, or the
  // whole band looks like it's pulsing. `transformOrigin` is the obvious way to
  // say that and it throws inside an animated component, so the pivot is built
  // into the transform list instead: shift the origin down to the crest, scale,
  // shift back. RN reads the list right-to-left, so the last entry applies
  // first. `pivot` is the crest's offset from the layer's own centre.
  const pivot = crestY - h / 2;
  const bloomStyle = useAnimatedStyle(() => ({
    opacity: 0.88 + 0.12 * breathe.value,
    transform: [
      { translateY: pivot },
      { scale: 1 + 0.035 * breathe.value },
      { translateY: -pivot },
    ],
  }));

  return (
    <View style={[styles.wrap, { height: h }]} pointerEvents="none">
      {/* Sky — the flat base everything else is lit over. */}
      <Svg width={w} height={h}>
        <Defs>
          <SvgLinearGradient id="sky" x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={ill.sky[0]} />
            <Stop offset="1" stopColor={ill.sky[1]} />
          </SvgLinearGradient>
        </Defs>
        <Rect width={w} height={h} fill="url(#sky)" />
      </Svg>

      {/* Atmosphere — its own Svg so the wrapper can breathe on the UI thread. */}
      <Animated.View style={[styles.layer, bloomStyle]}>
        <Svg width={w} height={h}>
          <Defs>
            {/* Eased three-stop bloom — one long two-stop radial would band. */}
            <RadialGradient
              id="bloom"
              cx={w / 2}
              cy={crestY + 20}
              rx={w * 0.65}
              ry={w * 0.42}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor={ill.bloom.color} stopOpacity={ill.bloom.opacity} />
              <Stop
                offset="0.45"
                stopColor={ill.bloomMid.color}
                stopOpacity={ill.bloomMid.opacity}
              />
              <Stop offset="1" stopColor={ill.bloomMid.color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={w} height={h} fill="url(#bloom)" />
        </Svg>
      </Animated.View>

      {/* Limb, glint, arcs — the structure over the light. */}
      <View style={styles.layer}>
        <Svg width={w} height={h}>
          <Defs>
            {/* Crest → page bg, so the slivers beside the glass pill are seamless. */}
            <SvgLinearGradient
              id="limb"
              x1="0"
              y1={crestY}
              x2="0"
              y2={h}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor={ill.limb[0]} />
              <Stop offset="1" stopColor={ill.limb[1]} />
            </SvgLinearGradient>
            {/* The glint fades out before the screen edges — light catches the
                crest where the sun sits, not uniformly. */}
            <SvgLinearGradient id="glint" x1="0" y1="0" x2={w} y2="0" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={ill.glint.color} stopOpacity={0} />
              <Stop offset="0.5" stopColor={ill.glint.color} stopOpacity={ill.glint.opacity} />
              <Stop offset="1" stopColor={ill.glint.color} stopOpacity={0} />
            </SvgLinearGradient>
          </Defs>

          {ARCS.map(({ offset, opacity }) => (
            <Circle
              key={offset}
              cx={limbCx}
              cy={limbCy}
              r={limbR + offset}
              stroke={ill.arc}
              strokeOpacity={opacity}
              strokeWidth={1.25}
              fill="none"
            />
          ))}
          <Circle cx={limbCx} cy={limbCy} r={limbR} fill="url(#limb)" />
          <Circle
            cx={limbCx}
            cy={limbCy}
            r={limbR}
            stroke="url(#glint)"
            strokeWidth={1.5}
            fill="none"
          />
        </Svg>
      </View>

      {/* Mark and heading in the sky the artwork leaves them: from under the
          status bar down to the crest. Anchored to the top of that box at a
          fixed gap rather than centred in it — see LOCKUP_TOP_GAP. Sizing the
          box off the crest is still what keeps the heading off the glint as the
          band's height flexes with the device. */}
      <View
        style={[styles.lockup, { top: insets.top, height: Math.max(0, crestY - insets.top) }]}
      >
        <Logo size={MARK} color={ill.mark} />
        {title ? (
          <AppText variant="h1" align="center" style={styles.title}>
            {title}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { overflow: 'hidden' },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  lockup: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: LOCKUP_TOP_GAP,
    paddingHorizontal: layout.SCREEN_H_PADDING,
  },
  // Close enough that the mark and the line read as one lockup rather than two
  // stacked things, and capped so the heading holds its line on wide screens
  // instead of stretching into the gutters.
  title: { marginTop: spacing.md, maxWidth: 320 },
}));

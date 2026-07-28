import { useEffect, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { makeStyles, radius, useTheme } from '@/theme';

type Tone = 'accent' | 'success' | 'live' | 'onBrand';

interface Props {
  /** 0..1 */
  value: number;
  height?: number;
  tone?: Tone;
  /** Use the brand gradient instead of a flat fill. */
  gradient?: boolean;
  /**
   * Ease the fill to its new width instead of snapping. Opt-in: a bar that
   * reports live progress (a timer, a download) should snap, but one that
   * advances in discrete steps reads as broken when it jumps.
   */
  animated?: boolean;
  /**
   * Starting point for the first animation, 0..1. Needed when each screen
   * mounts its own bar — without it there's no previous value to move from,
   * so the fill would simply appear at its destination.
   */
  animateFrom?: number;
}

export function ProgressBar({
  value,
  height = 6,
  tone = 'accent',
  gradient = false,
  animated = false,
  animateFrom,
}: Props) {
  const { colors, gradients } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();

  const clamped = Math.min(1, Math.max(0, value));
  // onBrand = the bar sits on the brand-blue fill, where the blue gradient and
  // the default sunken track are both invisible — white fill, overlay track.
  const toneFill: Record<Tone, string> = {
    accent: colors.accent,
    success: colors.success,
    live: colors.live,
    onBrand: colors.textInverse,
  };

  // Reanimated can't interpolate percentage strings, so the animated path
  // measures the track and drives a pixel width instead.
  const [trackWidth, setTrackWidth] = useState(0);
  const fillWidth = useSharedValue(0);
  const firstLayout = useSharedValue(true);

  useEffect(() => {
    if (!animated || trackWidth === 0) return;
    const target = trackWidth * clamped;

    if (reduceMotion) {
      firstLayout.value = false;
      fillWidth.value = target;
      return;
    }

    if (firstLayout.value) {
      firstLayout.value = false;
      // With no explicit start the bar should simply appear in place —
      // sweeping in from zero on every mount would be noise, not progress.
      if (animateFrom == null) {
        fillWidth.value = target;
        return;
      }
      fillWidth.value = trackWidth * Math.min(1, Math.max(0, animateFrom));
    }

    fillWidth.value = withTiming(target, {
      duration: 300,
      easing: Easing.out(Easing.quad),
    });
  }, [
    animated,
    clamped,
    animateFrom,
    trackWidth,
    reduceMotion,
    fillWidth,
    firstLayout,
  ]);

  const animatedFill = useAnimatedStyle(() => ({ width: fillWidth.value }));

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== trackWidth) setTrackWidth(w);
  };

  const staticWidth = `${clamped * 100}%` as const;
  const fillStyle = [
    styles.fill,
    { borderRadius: height / 2 },
    animated ? animatedFill : { width: staticWidth },
  ];

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: height / 2 },
        tone === 'onBrand' && { backgroundColor: colors.onBrandOverlay },
      ]}
      onLayout={animated ? onLayout : undefined}
    >
      {gradient ? (
        <Animated.View style={fillStyle}>
          <LinearGradient
            colors={gradients.button}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientFill}
          />
        </Animated.View>
      ) : (
        <Animated.View
          style={[...fillStyle, { backgroundColor: toneFill[tone] }]}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  track: {
    backgroundColor: t.colors.sunken,
    overflow: 'hidden',
    borderRadius: radius.pill,
  },
  fill: { height: '100%' },
  gradientFill: { flex: 1 },
}));

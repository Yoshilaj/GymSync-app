import { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  makeMutable,
  useAnimatedStyle,
  useReducedMotion,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { radius, useTheme } from '@/theme';

/**
 * `onBrand` = the block sits on the brand/twilight gradient (the Progress
 * header), where the light `sunken` fill is glaringly wrong — the same problem,
 * and the same name, as ProgressBar's `onBrand` track.
 */
type Tone = 'default' | 'onBrand';

interface Props {
  width?: number | `${number}%`;
  height?: number;
  round?: boolean;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}

const SWEEP_MS = 1200;
/** The highlight is wider than its block so it enters and exits off-edge. */
const SWEEP_SCALE = 1.6;

/**
 * ONE clock for every skeleton on screen. Each block starts its own animation
 * at mount and scales the sweep to its own width, so per-block timelines drift
 * apart in both phase and speed — a list of seven rows ends up shimmering like
 * TV static. Sharing the 0→1 driver locks them into a single wave; only the
 * pixel distance is per-block.
 */
const sweepClock = makeMutable(0);
let sweepSubscribers = 0;

function useSweepClock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    sweepSubscribers += 1;
    if (sweepSubscribers === 1) {
      sweepClock.value = 0;
      sweepClock.value = withRepeat(
        withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
        -1,
        false,
      );
    }
    return () => {
      sweepSubscribers -= 1;
      // Nothing left to shimmer — don't leave a timing loop running on the UI
      // thread behind a closed drawer or an unmounted screen.
      if (sweepSubscribers === 0) cancelAnimation(sweepClock);
    };
  }, [active]);
}

/** Loading placeholder block with a shimmer sweep travelling across it. */
export function Skeleton({
  width = '100%',
  height = 14,
  round = false,
  tone = 'default',
  style,
}: Props) {
  const { colors, gradients, scheme } = useTheme();
  const reduceMotion = useReducedMotion();

  // Reanimated can't interpolate percentage strings and most call sites size by
  // percent, so measure the block and drive the sweep in pixels — the same
  // constraint ProgressBar's animated fill works around.
  const [blockWidth, setBlockWidth] = useState(
    typeof width === 'number' ? width : 0,
  );

  const animate = !reduceMotion && blockWidth > 0;
  useSweepClock(animate);

  const sweepStyle = useAnimatedStyle(() => {
    const travel = blockWidth * SWEEP_SCALE;
    return {
      transform: [
        { translateX: -travel + sweepClock.value * (travel + blockWidth) },
      ],
    };
  });

  // On dark, `sunken` is DARKER than `card`, so a skeleton inside a card reads
  // as a hole punched through it rather than a placeholder sitting on it.
  const fill =
    tone === 'onBrand'
      ? colors.onBrandOverlay
      : scheme === 'dark'
        ? colors.border
        : colors.sunken;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== blockWidth) setBlockWidth(w);
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        {
          width,
          height,
          borderRadius: round ? height / 2 : radius.sm,
          backgroundColor: fill,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {animate ? (
        <Animated.View
          style={[
            { width: blockWidth * SWEEP_SCALE, height: '100%' },
            sweepStyle,
          ]}
        >
          <LinearGradient
            colors={
              tone === 'onBrand'
                ? gradients.skeletonSweepOnBrand
                : gradients.skeletonSweep
            }
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

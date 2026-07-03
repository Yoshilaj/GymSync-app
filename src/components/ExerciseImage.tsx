import { useEffect, useState } from 'react';
import { AccessibilityInfo, Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius as radiusTokens } from '@/theme';
import { MuscleIcon } from '@/components/MuscleIcon';
import { getExerciseImages } from '@/data/exerciseImages';
import { getExerciseById } from '@/data/mockExercises';
import { MuscleGroup } from '@/types';

const HOLD_MS = 1500;
const FADE_MS = 400;

interface Props {
  exerciseId: string;
  /** Fallback MuscleIcon target when no photos exist for this exercise. */
  muscle: MuscleGroup;
  /** Square thumbnail mode (lists). */
  size?: number;
  /** Fill-width hero mode. */
  aspectRatio?: number;
  /** Cross-fade the start/end photo pair (hero only). */
  animate?: boolean;
  radius?: keyof typeof radiusTokens | number;
  fallbackTint?: string;
  style?: StyleProp<ViewStyle>;
  /** Fires at each fade midpoint — drives the hero's frame dots. */
  onFrameChange?: (frame: 0 | 1) => void;
}

/**
 * An exercise's photo (free-exercise-db pair). Static first frame in lists;
 * in hero mode the pair breathes between start and end position:
 * 1.5s hold → 400ms cross-fade → 1.5s hold → fade back.
 * Falls back to the MuscleIcon bubble when the exercise has no photos.
 */
export function ExerciseImage({
  exerciseId,
  muscle,
  size,
  aspectRatio = 3 / 2,
  animate = false,
  radius = 'lg',
  fallbackTint = colors.accentFaint,
  style,
  onFrameChange,
}: Props) {
  const pair = getExerciseImages(exerciseId);
  const borderRadius = typeof radius === 'number' ? radius : radiusTokens[radius];
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (!animate) return;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [animate]);

  if (!pair) {
    const s = size ?? 64;
    return (
      <View
        style={[
          styles.fallback,
          { width: s, height: s, borderRadius: s / 2, backgroundColor: fallbackTint },
          style,
        ]}
      >
        <MuscleIcon muscle={muscle} size={Math.round(s * 0.8)} />
      </View>
    );
  }

  const frame = size
    ? { width: size, height: size }
    : { width: '100%' as const, aspectRatio };
  const shouldAnimate = animate && !reduceMotion;
  const label = getExerciseById(exerciseId)?.name ?? 'Exercise';

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.frame, frame, { borderRadius }, style]}
    >
      <Image source={pair[0]} style={styles.img} resizeMode="cover" />
      {shouldAnimate ? (
        <CrossFadeFrame source={pair[1]} onFrameChange={onFrameChange} />
      ) : null}
    </View>
  );
}

function CrossFadeFrame({
  source,
  onFrameChange,
}: {
  source: NonNullable<ReturnType<typeof getExerciseImages>>[1];
  onFrameChange?: (frame: 0 | 1) => void;
}) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    const notify = (frame: 0 | 1) => onFrameChange?.(frame);
    opacity.value = withRepeat(
      withSequence(
        withDelay(
          HOLD_MS,
          withTiming(1, { duration: FADE_MS, easing: Easing.inOut(Easing.quad) }, () => {
            runOnJS(notify)(1);
          }),
        ),
        withDelay(
          HOLD_MS,
          withTiming(0, { duration: FADE_MS, easing: Easing.inOut(Easing.quad) }, () => {
            runOnJS(notify)(0);
          }),
        ),
      ),
      -1,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Image
      source={source}
      style={[StyleSheet.absoluteFill, styles.img, animatedStyle]}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.sunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  img: { width: '100%', height: '100%' },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

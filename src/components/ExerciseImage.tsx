import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { makeStyles, radius as radiusTokens, useTheme } from '@/theme';
import { MuscleIcon } from '@/components/MuscleIcon';
import { getExerciseImage } from '@/data/exerciseImages';
import { getExerciseById } from '@/data/mockExercises';
import { MuscleGroup } from '@/types';

interface Props {
  exerciseId: string;
  /** Fallback MuscleIcon target when no image exists for this exercise. */
  muscle: MuscleGroup;
  /** Square thumbnail mode (lists). */
  size?: number;
  /** Fill-width hero mode. */
  aspectRatio?: number;
  radius?: keyof typeof radiusTokens | number;
  fallbackTint?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * An exercise's body-part-highlight illustration. Rendered `contain` so the
 * full figure (and its highlighted muscles) always shows. Falls back to the
 * MuscleIcon bubble when the exercise has no image.
 */
export function ExerciseImage({
  exerciseId,
  muscle,
  size,
  aspectRatio = 3 / 2,
  radius = 'lg',
  fallbackTint,
  style,
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const image = getExerciseImage(exerciseId);
  const borderRadius = typeof radius === 'number' ? radius : radiusTokens[radius];
  const tint = fallbackTint ?? colors.accentFaint;

  if (!image) {
    const s = size ?? 64;
    return (
      <View
        style={[
          styles.fallback,
          { width: s, height: s, borderRadius: s / 2, backgroundColor: tint },
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
  const label = getExerciseById(exerciseId)?.name ?? 'Exercise';

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.frame, frame, { borderRadius }, style]}
    >
      <Image source={image} style={styles.img} resizeMode="contain" />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  frame: {
    overflow: 'hidden',
    backgroundColor: t.colors.sunken,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
  img: { width: '100%', height: '100%' },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

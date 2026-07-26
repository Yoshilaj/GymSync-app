import { View } from 'react-native';
import { makeStyles, radius, spacing } from '@/theme';
import { AnimatedPressable, AppText } from '@/components/ui';
import { ExerciseImage } from '@/components/ExerciseImage';
import { Exercise, PlannedSet, Units } from '@/types';

interface Props {
  exercise: Exercise;
  sets: PlannedSet[];
  units: Units;
  onPress?: () => void;
}

/** A planned exercise in a workout list: photo, name, one summary line. */
export function ExerciseRow({ exercise, sets, units, onPress }: Props) {
  const styles = useStyles();
  const reps = sets[0]?.targetReps ?? 0;
  const weight = sets[0]?.weight ?? 0;
  const load = weight > 0 ? `${weight} ${units}` : 'Bodyweight';

  const body = (
    <View style={styles.row}>
      <ExerciseImage
        exerciseId={exercise.id}
        muscle={exercise.muscleGroup}
        size={52}
        radius="md"
      />
      <View style={styles.textBlock}>
        <AppText variant="h3" numberOfLines={1}>
          {exercise.name}
        </AppText>
        <AppText variant="caption">
          {sets.length} Sets × {reps} Reps — {load}
        </AppText>
      </View>
    </View>
  );

  if (!onPress) return body;
  return <AnimatedPressable onPress={onPress}>{body}</AnimatedPressable>;
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...t.shadows.xs,
  },
  textBlock: { flex: 1, gap: 2 },
}));

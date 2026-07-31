import { View } from 'react-native';
import { makeStyles, radius, spacing } from '@/theme';
import { AnimatedPressable, AppText, Skeleton } from '@/components/ui';
import { ExerciseImage } from '@/components/ExerciseImage';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { Exercise, PlannedSet, Units } from '@/types';

interface Props {
  exercise: Exercise;
  sets: PlannedSet[];
  units: Units;
  onPress?: () => void;
  /**
   * Opt in to swipe-left-to-delete. Omitted, the row renders exactly as it
   * always has — history lists must never be editable.
   */
  onDelete?: () => void;
}

/** A planned exercise in a workout list: photo, name, one summary line. */
export function ExerciseRow({ exercise, sets, units, onPress, onDelete }: Props) {
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

  const tappable = onPress ? (
    <AnimatedPressable onPress={onPress}>{body}</AnimatedPressable>
  ) : (
    body
  );

  if (!onDelete) return tappable;

  return (
    <SwipeToDelete
      onDelete={onDelete}
      accessibilityLabel="Delete exercise"
      cornerRadius={radius.lg}
      // The row is an opaque card, so the red has to slide under its curve.
      tuckUnderCorners
    >
      {tappable}
    </SwipeToDelete>
  );
}

/**
 * The row's shape while the plan loads. Lives here, next to the thing it
 * mirrors, because PlanScreen and DayDetailScreen both need it and a copy in
 * each would drift the moment the real row changes. Keeps the card surface —
 * only the unknown content is greyed.
 */
export function ExerciseRowSkeleton() {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Skeleton width={52} height={52} style={{ borderRadius: radius.md }} />
      <View style={styles.textBlock}>
        <Skeleton width="62%" height={17} />
        <Skeleton width="40%" height={13} style={{ marginTop: spacing.xs }} />
      </View>
    </View>
  );
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

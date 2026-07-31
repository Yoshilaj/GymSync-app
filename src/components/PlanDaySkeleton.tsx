import { View } from 'react-native';
import { makeStyles, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import { WorkoutHeroCardSkeleton } from '@/components/WorkoutHeroCard';
import { ExerciseRowSkeleton } from '@/components/ExerciseRow';

/**
 * A day's shape while the plan is still in flight. Shared by PlanScreen and
 * DayDetailScreen, which render the same hero + rows composition — without
 * this they'd each grow their own copy and drift.
 *
 * Three rows, not five: content growing downward as it loads reads better than
 * a list collapsing. The "Add exercise" affordance is deliberately absent — it
 * would imply a tappable action for a workout that may not exist.
 */
export function PlanDaySkeleton() {
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <WorkoutHeroCardSkeleton />
      <View style={styles.list}>
        {/* Real copy, not a grey bar — this heading is known, and greying out
            text we can already render would cost shape for no honesty. */}
        <AppText variant="label" style={styles.heading}>
          Exercises
        </AppText>
        <ExerciseRowSkeleton />
        <ExerciseRowSkeleton />
        <ExerciseRowSkeleton />
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  wrap: { gap: spacing.lg },
  list: { gap: spacing.sm },
  heading: { paddingHorizontal: spacing.xs },
}));

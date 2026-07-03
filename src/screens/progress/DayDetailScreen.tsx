import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout, spacing } from '@/theme';
import { AppText, EmptyState } from '@/components/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { WorkoutHeroCard } from '@/components/WorkoutHeroCard';
import { ExerciseRow } from '@/components/ExerciseRow';
import { mockPlan } from '@/data/mockPlan';
import { getExerciseById } from '@/data/mockExercises';
import { useUser } from '@/context/UserContext';
import { useTabBarClearance } from '@/hooks';
import { PlannedWorkout, Units } from '@/types';
import { ProgressStackParamList } from '@/navigation/ProgressStack';

type Rt = RouteProp<ProgressStackParamList, 'DayDetail'>;
type Nav = NativeStackNavigationProp<ProgressStackParamList, 'DayDetail'>;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONGDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

type DayStatus = 'completed' | 'planned' | 'today';

function dayStatus(date: Date): DayStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return 'today';
  return d < today ? 'completed' : 'planned';
}

export function DayDetailScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { user } = useUser();
  const clearance = useTabBarClearance();

  const date = new Date(route.params.iso);
  const dayLabel = WEEKDAYS[date.getDay()];
  const longDay = LONGDAYS[date.getDay()];

  const workout = mockPlan.workouts.find((w) => w.dayLabel === dayLabel);
  const isRest = mockPlan.restDays.includes(dayLabel);
  const status = dayStatus(date);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader
        variant="detail"
        title={longDay}
        subtitle={`${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: clearance.scroll }]}
        showsVerticalScrollIndicator={false}
      >
        {workout ? (
          <DayWorkout
            workout={workout}
            status={status}
            units={user.units}
            onOpenExercise={(exerciseId) =>
              nav.navigate('ExerciseDetail', { exerciseId })
            }
          />
        ) : (
          <EmptyState
            icon={isRest ? 'bed-outline' : 'leaf-outline'}
            title={isRest ? 'Rest day' : 'No workout'}
            message={
              isRest
                ? 'Recovery was on the plan.'
                : 'No workout logged for this day.'
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DayWorkout({
  workout,
  status,
  units,
  onOpenExercise,
}: {
  workout: PlannedWorkout;
  status: DayStatus;
  units: Units;
  onOpenExercise: (exerciseId: string) => void;
}) {
  const totalSets = workout.exercises.reduce((a, e) => a + e.sets.length, 0);
  const volume = workout.exercises.reduce(
    (sum, pe) => sum + pe.sets.reduce((s, set) => s + set.targetReps * set.weight, 0),
    0,
  );
  const muscles = Array.from(
    new Set(
      workout.exercises
        .map((pe) => getExerciseById(pe.exerciseId)?.muscleGroup)
        .filter(Boolean) as string[],
    ),
  );

  // Derive the badge from the date — never claim "completed" for the future.
  const badge =
    status === 'completed'
      ? { icon: 'checkmark-circle' as const, label: 'Completed' }
      : status === 'today'
        ? { icon: 'barbell' as const, label: 'Today' }
        : { icon: 'calendar-outline' as const, label: 'Planned' };

  return (
    <View style={{ gap: spacing.lg }}>
      <WorkoutHeroCard
        badge={badge}
        title={workout.title}
        durationMin={workout.estMinutes}
        muscles={muscles}
        stats={[
          { label: 'Exercises', value: `${workout.exercises.length}` },
          { label: 'Sets', value: `${totalSets}` },
          { label: 'Volume', value: volume.toLocaleString(), unit: units },
        ]}
        tone={status === 'completed' ? 'completed' : 'upcoming'}
      />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" style={styles.listHeading}>
          Exercises
        </AppText>
        {workout.exercises.map((pe, i) => {
          const ex = getExerciseById(pe.exerciseId);
          if (!ex) return null;
          return (
            <ExerciseRow
              key={pe.exerciseId}
              exercise={ex}
              sets={pe.sets}
              units={units}
              onPress={() => onOpenExercise(ex.id)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingTop: spacing.sm,
  },
  listHeading: { marginLeft: spacing.xs },
});

import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppText, Card, EmptyState, Entering, ListRow, Screen } from '@/components/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { DayStrip, getWeekDates } from '@/components/DayStrip';
import { WorkoutHeroCard } from '@/components/WorkoutHeroCard';
import { ExerciseRow } from '@/components/ExerciseRow';
import { layout, spacing } from '@/theme';
import { mockPlan } from '@/data/mockPlan';
import { getExerciseById } from '@/data/mockExercises';
import { useUser } from '@/context/UserContext';
import { PlanStackParamList } from '@/navigation/PlanStack';
import { PlannedWorkout, Units } from '@/types';

type Nav = NativeStackNavigationProp<PlanStackParamList, 'PlanHome'>;

const WEEK_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function PlanScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useUser();

  const today = useMemo(() => new Date(), []);
  const todayLong = WEEK_LONG[today.getDay()];
  const [selectedDay, setSelectedDay] = useState<string>(todayLong);
  const weekDates = useMemo(() => getWeekDates(today), [today]);

  const workoutForDay = mockPlan.workouts.find((w) => w.dayLabel === selectedDay);
  const isRest = mockPlan.restDays.includes(selectedDay);
  const markedDays = mockPlan.workouts.map((w) => w.dayLabel);

  return (
    <Screen scroll padded={false}>
      <ScreenHeader variant="brand" />

      <DayStrip
        week={weekDates}
        selected={selectedDay}
        today={todayLong}
        onSelect={setSelectedDay}
        markedDays={markedDays}
      />

      <View style={styles.content}>
        {workoutForDay ? (
          <WorkoutDay
            workout={workoutForDay}
            isToday={selectedDay === todayLong}
            selectedDay={selectedDay}
            units={user.units}
            onStart={(id) => nav.navigate('LiveWorkoutStart', { workoutId: id })}
            onOpenExercise={(exerciseId) =>
              nav.navigate('ExerciseDetail', { exerciseId })
            }
          />
        ) : (
          <EmptyState
            mascot
            title={isRest ? 'Rest day' : 'Nothing scheduled'}
            message={
              isRest
                ? `Recovery is part of the plan. Sync kept ${selectedDay} light on purpose.`
                : `No workout on ${selectedDay}. Ask Sync to add one if you're feeling up for it.`
            }
            action={{
              label: 'Ask Sync',
              onPress: () => (nav.getParent() as any)?.navigate('Sync'),
            }}
          />
        )}

        {/* Always reachable — workout days and rest days alike. */}
        <View style={styles.librarySection}>
          <AppText variant="label" style={styles.listHeading}>
            Library
          </AppText>
          <Card padded={false}>
            <ListRow
              title="Exercise library"
              left={{ icon: 'library-outline', tone: 'accent' }}
              chevron
              onPress={() => nav.navigate('ExerciseList', { mode: 'browse' })}
            />
          </Card>
        </View>
      </View>
    </Screen>
  );
}

function WorkoutDay({
  workout,
  isToday,
  selectedDay,
  units,
  onStart,
  onOpenExercise,
}: {
  workout: PlannedWorkout;
  isToday: boolean;
  selectedDay: string;
  units: Units;
  onStart: (id: string) => void;
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

  return (
    <View style={{ gap: spacing.lg }}>
      <Entering>
      <WorkoutHeroCard
        badge={{
          icon: 'barbell',
          label: isToday ? 'Today' : selectedDay,
        }}
        title={workout.title}
        durationMin={workout.estMinutes}
        muscles={muscles}
        stats={[
          { label: 'Exercises', value: `${workout.exercises.length}` },
          { label: 'Sets', value: `${totalSets}` },
          { label: 'Volume', value: volume.toLocaleString(), unit: units },
        ]}
        // Only today's workout can be started; other days the list below IS the preview.
        action={
          isToday
            ? { label: 'Start workout', icon: 'play', onPress: () => onStart(workout.id) }
            : undefined
        }
      />
      </Entering>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" style={styles.listHeading}>
          Exercises
        </AppText>
        {workout.exercises.map((pe, i) => {
          const ex = getExerciseById(pe.exerciseId);
          if (!ex) return null;
          return (
            <Entering key={pe.exerciseId} index={i + 1}>
              <ExerciseRow
                exercise={ex}
                sets={pe.sets}
                units={units}
                onPress={() => onOpenExercise(ex.id)}
              />
            </Entering>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
    marginTop: spacing.lg,
  },
  listHeading: { marginLeft: spacing.xs, marginBottom: spacing.sm },
  librarySection: { marginTop: spacing.lg },
});

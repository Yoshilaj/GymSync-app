import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppText, Card, EmptyState, Entering, ListRow, Screen } from '@/components/ui';
import { DayStrip, getWeekDates } from '@/components/DayStrip';
import { WorkoutHeroCard } from '@/components/WorkoutHeroCard';
import { RestDayCard, NextWorkoutPreview } from '@/components/RestDayCard';
import { ExerciseRow } from '@/components/ExerciseRow';
import { layout, spacing } from '@/theme';
import { getExerciseById, resolvePlannedExercise } from '@/data/mockExercises';
import { useUser } from '@/context/UserContext';
import { usePlan } from '@/context/PlanContext';
import { PlanStackParamList } from '@/navigation/PlanStack';
import { PlannedWorkout, Units } from '@/types';

type Nav = NativeStackNavigationProp<PlanStackParamList, 'PlanHome'>;

const WEEK_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function PlanScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useUser();
  const { plan, status } = usePlan();

  const today = useMemo(() => new Date(), []);
  const todayLong = WEEK_LONG[today.getDay()];
  const [selectedDay, setSelectedDay] = useState<string>(todayLong);
  const weekDates = useMemo(() => getWeekDates(today), [today]);

  const workoutForDay = plan?.workouts.find((w) => w.dayLabel === selectedDay);
  const isRest = plan ? plan.restDays.includes(selectedDay) : false;
  const markedDays = plan ? plan.workouts.map((w) => w.dayLabel) : [];

  // The first scheduled workout after the selected day, walking the week cyclically.
  const nextWorkout = useMemo<NextWorkoutPreview | undefined>(() => {
    if (!plan) return undefined;
    const start = WEEK_LONG.indexOf(selectedDay);
    for (let i = 1; i <= 7; i += 1) {
      const day = WEEK_LONG[(start + i) % 7];
      const w = plan.workouts.find((x) => x.dayLabel === day);
      if (w) {
        return {
          title: w.title,
          dayLabel: w.dayLabel,
          estMinutes: w.estMinutes,
          exerciseCount: w.exercises.length,
        };
      }
    }
    return undefined;
  }, [plan, selectedDay]);

  return (
    <Screen scroll padded={false}>
      <View style={styles.headerGap} />
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
        ) : isRest ? (
          <Entering>
            <RestDayCard
              nextWorkout={nextWorkout}
              onPressNextWorkout={
                nextWorkout
                  ? () => setSelectedDay(nextWorkout.dayLabel)
                  : undefined
              }
            />
          </Entering>
        ) : (
          <EmptyState
            icon="leaf-outline"
            title="Nothing scheduled"
            message={`No workout on ${selectedDay}. Ask Sync to add one if you're feeling up for it.`}
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
          const ex = resolvePlannedExercise(pe.exerciseId, pe.name);
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
  headerGap: { height: spacing.sm },
});

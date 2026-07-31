import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppText, EmptyState, Entering, Screen } from '@/components/ui';
import { PlanDaySkeleton } from '@/components/PlanDaySkeleton';
import { DayStrip, getWeekDates } from '@/components/DayStrip';
import { WorkoutHeroCard } from '@/components/WorkoutHeroCard';
import { RestDayCard, NextWorkoutPreview } from '@/components/RestDayCard';
import { ExerciseRow } from '@/components/ExerciseRow';
import { BodyWeightCard } from '@/components/BodyWeightCard';
import { LibraryCard } from '@/components/LibraryCard';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';
import {
  getCategory,
  getExerciseById,
  mockExercises,
  resolvePlannedExercise,
} from '@/data/mockExercises';
import { useUser } from '@/context/UserContext';
import { usePlan } from '@/context/PlanContext';
import { PlanApiError } from '@/api/plan';
import { PlanStackParamList } from '@/navigation/PlanStack';
import { PlannedWorkout, Units } from '@/types';

type Nav = NativeStackNavigationProp<PlanStackParamList, 'PlanHome'>;

const WEEK_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function PlanScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<PlanStackParamList, 'PlanHome'>>();
  const { colors } = useTheme();
  const styles = useStyles();
  const { user } = useUser();
  const { plan, status: planStatus, addExercise, removeExercise } = usePlan();

  const today = useMemo(() => new Date(), []);
  const todayIso = today.toDateString();
  const [selectedIso, setSelectedIso] = useState<string>(todayIso);
  const [weekOffset, setWeekOffset] = useState(0);

  // Derived — the plan is weekly-recurring, so every downstream consumer
  // still keys off the weekday label; only selection became date-based.
  const selectedDay = WEEK_LONG[new Date(selectedIso).getDay()];

  const workoutForDay = plan?.workouts.find((w) => w.dayLabel === selectedDay);
  const isRest = plan ? plan.restDays.includes(selectedDay) : false;
  const markedDays = plan ? plan.workouts.map((w) => w.dayLabel) : [];

  // Resolve a weekday label to its concrete date within the VIEWED week.
  const isoForDayInViewedWeek = (dayLabel: string): string => {
    const ref = new Date(today);
    ref.setDate(ref.getDate() + weekOffset * 7);
    const hit = getWeekDates(ref).find((d) => d.long === dayLabel);
    return hit ? hit.iso : todayIso;
  };

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

  // The exercise picker hands its choice back through route params. Consume
  // once: clear the params BEFORE the async add, and latch, so a re-render or
  // a screen re-focus can't post the same exercise twice.
  const consumingRef = useRef(false);
  useEffect(() => {
    const { pickedExercise, targetWorkoutId } = route.params ?? {};
    if (!pickedExercise || !targetWorkoutId || consumingRef.current) return;
    consumingRef.current = true;
    nav.setParams({ pickedExercise: undefined, targetWorkoutId: undefined });
    const meta = getExerciseById(pickedExercise);
    void addExercise(targetWorkoutId, {
      exerciseId: pickedExercise,
      exerciseName: meta?.name ?? pickedExercise,
    })
      .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
      .catch((err: unknown) =>
        Alert.alert(
          'Could not add exercise',
          // The server explains refusals ("already in this workout"); a
          // transport failure has nothing to say, so fall back.
          (err instanceof PlanApiError && err.detail) ||
            'Check your connection and try again.',
        ),
      )
      .finally(() => {
        consumingRef.current = false;
      });
  }, [route.params?.pickedExercise, route.params?.targetWorkoutId]);

  const onDeleteExercise = (workoutId: string, planExerciseId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // The row is already gone locally; the context restores it if this fails.
    removeExercise(workoutId, planExerciseId).catch(() =>
      Alert.alert(
        'Could not remove exercise',
        'Check your connection and try again.',
      ),
    );
  };

  return (
    <Screen scroll padded={false}>
      <View style={styles.headerGap} />
      <DayStrip
        selectedIso={selectedIso}
        todayIso={todayIso}
        onSelectIso={setSelectedIso}
        markedDays={markedDays}
        weekOffset={weekOffset}
        onWeekChange={setWeekOffset}
      />

      <View style={styles.content}>
        {/* Order matters: "the plan hasn't arrived" and "there is no plan" are
            different sentences, and only the second one is an empty state. */}
        {planStatus === 'loading' ? (
          <PlanDaySkeleton />
        ) : workoutForDay ? (
          <WorkoutDay
            workout={workoutForDay}
            isToday={selectedIso === todayIso}
            selectedDay={selectedDay}
            units={user.units}
            onStart={(id) => nav.navigate('LiveWorkoutStart', { workoutId: id })}
            onOpenExercise={(exerciseId) =>
              nav.navigate('ExerciseDetail', { exerciseId })
            }
            onAddExercise={() =>
              nav.navigate('ExerciseList', {
                mode: 'picker',
                title: 'Add exercise',
                returnTo: 'PlanHome',
                targetWorkoutId: workoutForDay.id,
                // Both keys: a row saved ad-hoc has no catalog id to match on.
                existingKeys: workoutForDay.exercises.flatMap((pe) => [
                  pe.exerciseId,
                  (pe.name ?? '').toLowerCase(),
                ]),
              })
            }
            onDeleteExercise={onDeleteExercise}
          />
        ) : isRest ? (
          <Entering>
            <RestDayCard
              nextWorkout={nextWorkout}
              onPressNextWorkout={
                nextWorkout
                  ? () => setSelectedIso(isoForDayInViewedWeek(nextWorkout.dayLabel))
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

        {/* A quiet rule so the tools below read as their own section, not
            more exercises. */}
        <View style={[styles.sectionRule, { backgroundColor: colors.border }]} />

        {/* Always reachable — workout days and rest days alike. */}
        <View style={styles.librarySection}>
          <BodyWeightCard date={new Date(selectedIso)} />
          <LibraryCard
            count={mockExercises.length}
            onPress={() => nav.navigate('ExerciseList', { mode: 'browse' })}
          />
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
  onAddExercise,
  onDeleteExercise,
}: {
  workout: PlannedWorkout;
  isToday: boolean;
  selectedDay: string;
  units: Units;
  onStart: (id: string) => void;
  onOpenExercise: (exerciseId: string) => void;
  onAddExercise: () => void;
  onDeleteExercise: (workoutId: string, planExerciseId: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const totalSets = workout.exercises.reduce((a, e) => a + e.sets.length, 0);
  const volume = workout.exercises.reduce(
    (sum, pe) => sum + pe.sets.reduce((s, set) => s + set.targetReps * set.weight, 0),
    0,
  );
  // Library categories, not primary muscles: a back day should read "Back",
  // not "Lats" next to a chest day's "Chest". Resolve by name too so ad-hoc
  // rows still count, and drop unresolved ones rather than guessing.
  const muscles = Array.from(
    new Set(
      workout.exercises
        .map((pe) => resolvePlannedExercise(pe.exerciseId, pe.name).muscleGroup)
        .filter((m) => m !== 'Full Body')
        .map(getCategory),
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
        // Any workout day can start a session — `isToday` only drives the badge.
        action={{ label: 'Start workout', icon: 'play', onPress: () => onStart(workout.id) }}
      />
      </Entering>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="label" style={styles.listHeading}>
          Exercises
        </AppText>
        {workout.exercises.map((pe, i) => {
          const ex = resolvePlannedExercise(pe.exerciseId, pe.name);
          const rowId = pe.id;
          return (
            // Keyed on the server row id: a day can legitimately hold the same
            // exercise twice, and exit animations need unique keys.
            <Entering key={rowId ?? pe.exerciseId} index={i + 1} animateExit>
              <ExerciseRow
                exercise={ex}
                sets={pe.sets}
                units={units}
                onPress={() => onOpenExercise(ex.id)}
                // Rows from a pre-upgrade cache have no id yet — they become
                // deletable after the next refresh rather than crashing.
                onDelete={
                  rowId ? () => onDeleteExercise(workout.id, rowId) : undefined
                }
              />
            </Entering>
          );
        })}

        {workout.exercises.length === 0 && (
          <AppText variant="caption" color="textTertiary" style={styles.listHeading}>
            No exercises yet.
          </AppText>
        )}

        <Pressable onPress={onAddExercise} style={styles.addExerciseRow}>
          <Ionicons name="add" size={16} color={colors.accentText} />
          <AppText variant="caption" color="accentText">
            Add exercise
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  content: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
    marginTop: spacing.lg,
  },
  listHeading: { marginLeft: spacing.xs, marginBottom: spacing.sm },
  sectionRule: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing.xl,
    marginHorizontal: spacing.sm,
  },
  librarySection: { marginTop: spacing.lg, gap: spacing.md },
  headerGap: { height: spacing.sm },
  // Dashed placeholder at radius.lg so it lines up with the exercise cards
  // above it rather than looking like a different kind of object.
  addExerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.colors.border,
    marginTop: spacing.xs,
  },
}));

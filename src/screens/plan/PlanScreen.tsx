import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { AppHeader } from '@/components/AppHeader';
import { MuscleIcon } from '@/components/MuscleIcon';
import { colors, radius, spacing, typography } from '@/theme';
import { mockPlan } from '@/data/mockPlan';
import { getExerciseById } from '@/data/mockExercises';
import { useUser } from '@/context/UserContext';
import { PlanStackParamList } from '@/navigation/PlanStack';
import { PlannedWorkout } from '@/types';

type Nav = NativeStackNavigationProp<PlanStackParamList, 'PlanHome'>;

const WEEK: { letter: string; long: string }[] = [
  { letter: 'S', long: 'Sun' },
  { letter: 'M', long: 'Mon' },
  { letter: 'T', long: 'Tue' },
  { letter: 'W', long: 'Wed' },
  { letter: 'T', long: 'Thu' },
  { letter: 'F', long: 'Fri' },
  { letter: 'S', long: 'Sat' },
];

function getWeekDates(reference = new Date()) {
  const day = reference.getDay();
  const sunday = new Date(reference);
  sunday.setDate(reference.getDate() - day);
  return WEEK.map((w, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return { ...w, date: d.getDate(), iso: d.toDateString() };
  });
}

export function PlanScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useUser();

  const today = useMemo(() => new Date(), []);
  const todayLong = WEEK[today.getDay()].long;
  const [selectedDay, setSelectedDay] = useState<string>(todayLong);
  const weekDates = useMemo(() => getWeekDates(today), [today]);

  const workoutForDay = mockPlan.workouts.find((w) => w.dayLabel === selectedDay);
  const isRest = mockPlan.restDays.includes(selectedDay);

  return (
    <ScreenContainer scroll padded={false}>
      <AppHeader variant="brand" />

      <DayStrip
        week={weekDates}
        selected={selectedDay}
        today={todayLong}
        onSelect={setSelectedDay}
      />

      <View style={styles.content}>
        <WorkoutsTab
          workout={workoutForDay}
          isRest={isRest}
          selectedDay={selectedDay}
          isToday={selectedDay === todayLong}
          units={user.units}
          onStart={(id) => nav.navigate('WorkoutSession', { workoutId: id })}
        />
      </View>
    </ScreenContainer>
  );
}

function DayStrip({
  week,
  selected,
  today,
  onSelect,
}: {
  week: ReturnType<typeof getWeekDates>;
  selected: string;
  today: string;
  onSelect: (day: string) => void;
}) {
  return (
    <View style={dayStyles.row}>
      {week.map((d) => {
        const active = d.long === selected;
        const isToday = d.long === today;
        return (
          <Pressable
            key={d.long}
            onPress={() => onSelect(d.long)}
            style={dayStyles.cell}
          >
            <Text
              style={[
                dayStyles.letter,
                active && dayStyles.letterActive,
                !active && isToday && dayStyles.letterToday,
              ]}
            >
              {d.letter}
            </Text>
            <View
              style={[dayStyles.capsule, active && dayStyles.capsuleActive]}
            >
              <Text
                style={[
                  dayStyles.date,
                  active && dayStyles.dateActive,
                  !active && isToday && dayStyles.dateToday,
                ]}
              >
                {d.date}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const dayStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  cell: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  letter: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.1,
  },
  letterActive: { color: colors.text },
  letterToday: { color: colors.accent },
  capsule: {
    width: 36,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleActive: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  date: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  dateActive: { color: '#fff' },
  dateToday: { color: colors.accent },
});

function WorkoutsTab({
  workout,
  isRest,
  selectedDay,
  isToday,
  units,
  onStart,
}: {
  workout: PlannedWorkout | undefined;
  isRest: boolean;
  selectedDay: string;
  isToday: boolean;
  units: string;
  onStart: (id: string) => void;
}) {
  if (!workout) {
    return <EmptyState isRest={isRest} selectedDay={selectedDay} />;
  }

  const totalSets = workout.exercises.reduce((a, e) => a + e.sets.length, 0);
  const muscles = Array.from(
    new Set(
      workout.exercises
        .map((pe) => getExerciseById(pe.exerciseId)?.muscleGroup)
        .filter(Boolean) as string[]
    )
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={workoutStyles.hero}>
        <View style={workoutStyles.heroGlow} />
        <View style={workoutStyles.heroTopRow}>
          <View style={workoutStyles.heroBadge}>
            <Ionicons name="barbell" size={14} color="#fff" />
            <Text style={workoutStyles.heroBadgeText}>
              {isToday ? 'TODAY' : selectedDay.toUpperCase()}
            </Text>
          </View>
          <Text style={workoutStyles.heroDuration}>
            {workout.estMinutes} min
          </Text>
        </View>
        <Text style={workoutStyles.heroTitle}>{workout.title}</Text>
        <View style={workoutStyles.heroMuscles}>
          {muscles.map((m) => (
            <View key={m} style={workoutStyles.muscleChip}>
              <Text style={workoutStyles.muscleChipText}>{m}</Text>
            </View>
          ))}
        </View>

        <View style={workoutStyles.heroStatsRow}>
          <Stat label="Exercises" value={`${workout.exercises.length}`} />
          <View style={workoutStyles.statDivider} />
          <Stat label="Sets" value={`${totalSets}`} />
          <View style={workoutStyles.statDivider} />
          <Stat
            label="Volume"
            value={`${estimateVolume(workout).toLocaleString()}`}
            unit={units}
          />
        </View>

        <PrimaryButton
          title={isToday ? 'Start workout' : 'Preview workout'}
          icon={isToday ? 'play' : 'eye-outline'}
          onPress={() => onStart(workout.id)}
          style={{ marginTop: spacing.lg }}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={workoutStyles.listHeading}>Exercises</Text>
        {workout.exercises.map((pe, i) => {
          const ex = getExerciseById(pe.exerciseId);
          if (!ex) return null;
          const setCount = pe.sets.length;
          const reps = pe.sets[0].targetReps;
          const weight = pe.sets[0].weight;
          return (
            <View key={pe.exerciseId} style={workoutStyles.exRow}>
              <View style={workoutStyles.exContent}>
                <View style={workoutStyles.exHeader}>
                  <View style={workoutStyles.exMuscleWrap}>
                    <MuscleIcon muscle={ex.muscleGroup} size={44} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={workoutStyles.exNameRow}>
                      <Text style={workoutStyles.exIndex}>{i + 1}.</Text>
                      <Text style={workoutStyles.exName} numberOfLines={1}>
                        {ex.name}
                      </Text>
                    </View>
                    <Text style={workoutStyles.exMeta}>
                      {ex.equipment} · {ex.muscleGroup}
                    </Text>
                  </View>
                </View>

                <View style={workoutStyles.exFooter}>
                  <View style={workoutStyles.setsDotsRow}>
                    {Array.from({ length: setCount }).map((_, idx) => (
                      <View key={idx} style={workoutStyles.setDot} />
                    ))}
                    <Text style={workoutStyles.setsCountText}>
                      {setCount} sets
                    </Text>
                  </View>
                  <View style={workoutStyles.loadChip}>
                    <Text style={workoutStyles.loadReps}>{reps}</Text>
                    <Text style={workoutStyles.loadMul}>×</Text>
                    <Text style={workoutStyles.loadWeight}>
                      {weight > 0 ? `${weight}${units}` : 'BW'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function estimateVolume(w: PlannedWorkout) {
  return w.exercises.reduce(
    (sum, pe) =>
      sum + pe.sets.reduce((s, set) => s + set.targetReps * set.weight, 0),
    0
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={workoutStyles.statValue}>
        {value}
        {unit ? <Text style={workoutStyles.statUnit}> {unit}</Text> : null}
      </Text>
      <Text style={workoutStyles.statLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({
  isRest,
  selectedDay,
}: {
  isRest: boolean;
  selectedDay: string;
}) {
  return (
    <View style={workoutStyles.empty}>
      <View style={workoutStyles.emptyCircle}>
        <Ionicons
          name={isRest ? 'bed-outline' : 'leaf-outline'}
          size={28}
          color={colors.accent}
        />
      </View>
      <Text style={workoutStyles.emptyTitle}>
        {isRest ? 'Rest day' : 'Nothing scheduled'}
      </Text>
      <Text style={workoutStyles.emptyText}>
        {isRest
          ? `Recovery is part of the plan. Sync kept ${selectedDay} light on purpose.`
          : `No workout on ${selectedDay}. Ask Sync to add one if you're feeling up for it.`}
      </Text>
    </View>
  );
}

const workoutStyles = StyleSheet.create({
  hero: {
    backgroundColor: colors.accent,
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  heroGlow: {
    position: 'absolute',
    top: -40,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  heroBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  heroDuration: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: spacing.md,
    lineHeight: 30,
  },
  heroMuscles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
  },
  muscleChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  muscleChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  statUnit: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
  statLabel: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  listHeading: {
    ...typography.label,
    color: colors.textMuted,
    marginLeft: spacing.xs,
  },
  exRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
  },
  exContent: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  exHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  exMuscleWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exIndex: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.accent,
  },
  exName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.1,
    flex: 1,
  },
  exMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
    fontWeight: '500',
  },
  exFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 60,
  },
  setsDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  setDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  setsCountText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  loadChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loadReps: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  loadMul: {
    fontSize: 11,
    color: colors.textMuted,
    marginHorizontal: 4,
    fontWeight: '700',
  },
  loadWeight: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: spacing.sm,
  },
  emptyCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...typography.title,
    fontSize: 18,
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
    fontSize: 14,
  },
});

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
});

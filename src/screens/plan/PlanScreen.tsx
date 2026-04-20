import { useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  LayoutChangeEvent,
  Image,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { AppHeader } from '@/components/AppHeader';
import { MuscleIcon } from '@/components/MuscleIcon';
import { colors, radius, spacing, typography } from '@/theme';
import {
  mockPlan,
  mockCalorieGoal,
  getIntakeForDay,
} from '@/data/mockPlan';
import { getExerciseById } from '@/data/mockExercises';
import { useUser } from '@/context/UserContext';
import { PlanStackParamList } from '@/navigation/PlanStack';
import { FoodIntakeEntry, PlannedWorkout } from '@/types';

type Nav = NativeStackNavigationProp<PlanStackParamList, 'PlanHome'>;
type Mode = 'workouts' | 'calories';

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

  const [mode, setMode] = useState<Mode>('workouts');
  const today = useMemo(() => new Date(), []);
  const todayLong = WEEK[today.getDay()].long;
  const [selectedDay, setSelectedDay] = useState<string>(todayLong);
  const weekDates = useMemo(() => getWeekDates(today), [today]);

  const workoutForDay = mockPlan.workouts.find((w) => w.dayLabel === selectedDay);
  const isRest = mockPlan.restDays.includes(selectedDay);

  return (
    <ScreenContainer scroll padded={false}>
      <AppHeader variant="brand" />

      <View style={styles.toggleWrap}>
        <ModeToggle mode={mode} onChange={setMode} />
      </View>

      <DayStrip
        week={weekDates}
        selected={selectedDay}
        today={todayLong}
        onSelect={setSelectedDay}
      />

      <View style={styles.content}>
        {mode === 'workouts' ? (
          <WorkoutsTab
            workout={workoutForDay}
            isRest={isRest}
            selectedDay={selectedDay}
            isToday={selectedDay === todayLong}
            units={user.units}
            onStart={(id) => nav.navigate('WorkoutSession', { workoutId: id })}
          />
        ) : (
          <CaloriesTab
            selectedDay={selectedDay}
            isToday={selectedDay === todayLong}
          />
        )}
      </View>
    </ScreenContainer>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  const [segWidths, setSegWidths] = useState<[number, number]>([0, 0]);
  const slide = useRef(new Animated.Value(mode === 'workouts' ? 0 : 1)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: mode === 'workouts' ? 0 : 1,
      useNativeDriver: false,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
    }).start();
  }, [mode]);

  const activeLeft = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, segWidths[0]],
  });
  const activeWidth = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [segWidths[0] || 1, segWidths[1] || 1],
  });

  const onLayout = (idx: 0 | 1) => (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setSegWidths((prev) => {
      const next = [...prev] as [number, number];
      next[idx] = w;
      return next;
    });
  };

  return (
    <View style={toggleStyles.container}>
      <Animated.View
        pointerEvents="none"
        style={[
          toggleStyles.activePill,
          { left: activeLeft, width: activeWidth },
        ]}
      />
      <Pressable
        style={toggleStyles.segment}
        onLayout={onLayout(0)}
        onPress={() => onChange('workouts')}
      >
        <Text
          style={[
            toggleStyles.label,
            mode === 'workouts' && toggleStyles.labelActive,
          ]}
        >
          Workouts
        </Text>
      </Pressable>
      <Pressable
        style={toggleStyles.segment}
        onLayout={onLayout(1)}
        onPress={() => onChange('calories')}
      >
        <Text
          style={[
            toggleStyles.label,
            mode === 'calories' && toggleStyles.labelActive,
          ]}
        >
          Calories
        </Text>
      </Pressable>
    </View>
  );
}

const toggleStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    position: 'relative',
  },
  segment: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    zIndex: 1,
  },
  activePill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  labelActive: {
    color: '#fff',
  },
});

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
          ? `Recovery is part of the plan. Homie kept ${selectedDay} light on purpose.`
          : `No workout on ${selectedDay}. Ask Homie to add one if you're feeling up for it.`}
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

function CaloriesTab({
  selectedDay,
  isToday,
}: {
  selectedDay: string;
  isToday: boolean;
}) {
  const entries = getIntakeForDay(selectedDay);
  const consumed = entries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein: acc.protein + e.proteinG,
      carbs: acc.carbs + e.carbsG,
      fat: acc.fat + e.fatG,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const { dailyKcal, proteinG, carbsG, fatG } = mockCalorieGoal;
  const kcalLeft = Math.max(dailyKcal - consumed.kcal, 0);
  const proteinLeft = Math.max(proteinG - consumed.protein, 0);
  const carbsLeft = Math.max(carbsG - consumed.carbs, 0);
  const fatLeft = Math.max(fatG - consumed.fat, 0);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={calStyles.totalCard}>
        <View style={{ flex: 1 }}>
          <Text style={calStyles.bigNumber}>{kcalLeft.toLocaleString()}</Text>
          <Text style={calStyles.bigLabel}>Calories left</Text>
          <Text style={calStyles.bigSub}>
            {consumed.kcal.toLocaleString()} / {dailyKcal.toLocaleString()} kcal
          </Text>
        </View>
        <Ring
          size={104}
          stroke={12}
          progress={Math.min(consumed.kcal / dailyKcal, 1)}
          color={colors.warning}
          trackColor={colors.surfaceElevated}
        >
          <Text style={calStyles.ringEmoji}>🔥</Text>
        </Ring>
      </View>

      <View style={calStyles.macroRow}>
        <MacroCard
          label="Protein"
          value={`${proteinLeft}g`}
          progress={Math.min(consumed.protein / proteinG, 1)}
          color="#E04545"
          icon="🍗"
        />
        <MacroCard
          label="Carbs"
          value={`${carbsLeft}g`}
          progress={Math.min(consumed.carbs / carbsG, 1)}
          color="#25B572"
          icon="🌾"
        />
        <MacroCard
          label="Fat"
          value={`${fatLeft}g`}
          progress={Math.min(consumed.fat / fatG, 1)}
          color="#E4A62F"
          icon="🥑"
        />
      </View>

      <View>
        <Text style={calStyles.sectionTitle}>Food intake</Text>
        {entries.length === 0 ? (
          <View style={calStyles.emptyIntake}>
            <Ionicons name="camera-outline" size={24} color={colors.textMuted} />
            <Text style={calStyles.emptyIntakeText}>
              No meals logged{isToday ? ' yet today' : ` for ${selectedDay}`}.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {entries.map((e) => (
              <IntakeCard key={e.id} entry={e} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function MacroCard({
  label,
  value,
  progress,
  color,
  icon,
}: {
  label: string;
  value: string;
  progress: number;
  color: string;
  icon: string;
}) {
  return (
    <View style={calStyles.macroCard}>
      <Ring
        size={58}
        stroke={6}
        progress={progress}
        color={color}
        trackColor={colors.surfaceElevated}
      >
        <Text style={calStyles.macroIcon}>{icon}</Text>
      </Ring>
      <Text style={calStyles.macroValue}>{value}</Text>
      <Text style={calStyles.macroLabel}>{label} left</Text>
    </View>
  );
}

function IntakeCard({ entry }: { entry: FoodIntakeEntry }) {
  if (entry.failed) {
    return (
      <View style={calStyles.intakeFailed}>
        <View
          style={[
            calStyles.intakeThumbSmall,
            { backgroundColor: entry.thumbnailColor },
          ]}
        >
          <Text style={calStyles.intakeEmoji}>{entry.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={calStyles.intakeFailedTitle}>{entry.title}</Text>
          <Pressable style={calStyles.scanAgainBtn}>
            <Ionicons name="refresh" size={13} color={colors.text} />
            <Text style={calStyles.scanAgainText}>Scan again</Text>
          </Pressable>
        </View>
        <Pressable hitSlop={10}>
          <Ionicons name="close" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={calStyles.intakeCard}>
      <View style={calStyles.intakeImageWrap}>
        {entry.imageUrl ? (
          <Image
            source={{ uri: entry.imageUrl }}
            style={calStyles.intakeImage}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              calStyles.intakeImage,
              { backgroundColor: entry.thumbnailColor, alignItems: 'center', justifyContent: 'center' },
            ]}
          >
            <Text style={{ fontSize: 48 }}>{entry.emoji}</Text>
          </View>
        )}
        <View style={calStyles.intakeImageOverlay} />
        <View style={calStyles.intakeTimePill}>
          <Ionicons name="time-outline" size={11} color="#fff" />
          <Text style={calStyles.intakeTimeText}>{entry.time}</Text>
        </View>
        <View style={calStyles.intakeKcalPill}>
          <Text style={calStyles.intakeKcalNum}>{entry.kcal}</Text>
          <Text style={calStyles.intakeKcalUnit}>kcal</Text>
        </View>
      </View>

      <View style={calStyles.intakeBody}>
        <Text style={calStyles.intakeTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <View style={calStyles.macroTriplet}>
          <MacroStat letter="P" value={entry.proteinG} color="#E04545" />
          <View style={calStyles.macroDivider} />
          <MacroStat letter="C" value={entry.carbsG} color="#25B572" />
          <View style={calStyles.macroDivider} />
          <MacroStat letter="F" value={entry.fatG} color="#E4A62F" />
        </View>
      </View>
    </View>
  );
}

function MacroStat({
  letter,
  value,
  color,
}: {
  letter: string;
  value: number;
  color: string;
}) {
  return (
    <View style={calStyles.macroStat}>
      <View style={[calStyles.macroBadge, { backgroundColor: color }]}>
        <Text style={calStyles.macroBadgeText}>{letter}</Text>
      </View>
      <Text style={calStyles.macroStatValue}>{value}g</Text>
    </View>
  );
}

function Ring({
  size,
  stroke,
  progress,
  color,
  trackColor,
  children,
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = c * (1 - clamped);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={trackColor}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </G>
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

const calStyles = StyleSheet.create({
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: spacing.md,
  },
  bigNumber: {
    fontSize: 44,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -1.4,
    lineHeight: 48,
  },
  bigLabel: {
    fontSize: 15,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  bigSub: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: spacing.xs,
    fontWeight: '500',
  },
  ringEmoji: { fontSize: 28 },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  macroIcon: { fontSize: 22 },
  macroValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  macroLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  sectionTitle: {
    ...typography.title,
    fontSize: 18,
    marginBottom: spacing.md,
  },
  intakeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
    shadowColor: '#0B2447',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  intakeImageWrap: {
    width: '100%',
    height: 180,
    position: 'relative',
    backgroundColor: colors.surfaceElevated,
  },
  intakeImage: {
    width: '100%',
    height: '100%',
  },
  intakeImageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 70,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  intakeTimePill: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(11,36,71,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  intakeTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  intakeKcalPill: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    shadowColor: '#0B2447',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  intakeKcalNum: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.3,
  },
  intakeKcalUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  intakeBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  intakeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  intakeThumbSmall: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intakeEmoji: { fontSize: 28 },
  macroTriplet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: 2,
  },
  macroDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.borderSoft,
  },
  macroStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  macroBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  macroStatValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  intakeFailed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
  },
  intakeFailedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  scanAgainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  scanAgainText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  emptyIntake: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  emptyIntakeText: {
    ...typography.bodyMuted,
    fontSize: 14,
  },
});

const styles = StyleSheet.create({
  toggleWrap: {
    paddingHorizontal: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
});

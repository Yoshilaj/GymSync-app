import { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/theme';
import { MuscleIcon } from '@/components/MuscleIcon';
import {
  mockPlan,
  mockCalorieGoal,
  getIntakeForDay,
} from '@/data/mockPlan';
import { getExerciseById } from '@/data/mockExercises';
import { useUser } from '@/context/UserContext';
import { ProgressStackParamList } from '@/navigation/ProgressStack';
import { FoodIntakeEntry } from '@/types';

type Rt = RouteProp<ProgressStackParamList, 'DayDetail'>;
type Mode = 'workouts' | 'calories';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONGDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export function DayDetailScreen() {
  const nav = useNavigation();
  const route = useRoute<Rt>();
  const { user } = useUser();
  const [mode, setMode] = useState<Mode>('workouts');

  const date = new Date(route.params.iso);
  const dayLabel = WEEKDAYS[date.getDay()];
  const longDay = LONGDAYS[date.getDay()];

  const workout = mockPlan.workouts.find((w) => w.dayLabel === dayLabel);
  const isRest = mockPlan.restDays.includes(dayLabel);
  const entries = getIntakeForDay(dayLabel);

  const consumed = entries.reduce(
    (a, e) => ({
      kcal: a.kcal + e.kcal,
      protein: a.protein + e.proteinG,
      carbs: a.carbs + e.carbsG,
      fat: a.fat + e.fatG,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerDay}>{longDay}</Text>
          <Text style={styles.headerDate}>
            {MONTHS[date.getMonth()]} {date.getDate()}, {date.getFullYear()}
          </Text>
        </View>
      </View>

      <View style={styles.toggleWrap}>
        <Toggle mode={mode} onChange={setMode} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {mode === 'workouts' ? (
          <WorkoutsView workout={workout} isRest={isRest} units={user.units} />
        ) : (
          <CaloriesView consumed={consumed} entries={entries} dayLabel={dayLabel} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Toggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const [widths, setWidths] = useState<[number, number]>([0, 0]);
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

  const left = slide.interpolate({ inputRange: [0, 1], outputRange: [0, widths[0]] });
  const width = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [widths[0] || 1, widths[1] || 1],
  });

  const onLayout = (i: 0 | 1) => (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidths((prev) => {
      const next = [...prev] as [number, number];
      next[i] = w;
      return next;
    });
  };

  return (
    <View style={toggle.container}>
      <Animated.View
        pointerEvents="none"
        style={[toggle.pill, { left, width }]}
      />
      <Pressable onLayout={onLayout(0)} onPress={() => onChange('workouts')} style={toggle.seg}>
        <Text style={[toggle.label, mode === 'workouts' && toggle.labelActive]}>
          Workouts
        </Text>
      </Pressable>
      <Pressable onLayout={onLayout(1)} onPress={() => onChange('calories')} style={toggle.seg}>
        <Text style={[toggle.label, mode === 'calories' && toggle.labelActive]}>
          Calories
        </Text>
      </Pressable>
    </View>
  );
}

function WorkoutsView({
  workout,
  isRest,
  units,
}: {
  workout: any;
  isRest: boolean;
  units: string;
}) {
  if (!workout) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons
            name={isRest ? 'bed-outline' : 'leaf-outline'}
            size={28}
            color={colors.accent}
          />
        </View>
        <Text style={styles.emptyTitle}>{isRest ? 'Rest day' : 'No workout'}</Text>
        <Text style={styles.emptyText}>
          {isRest ? 'Recovery was on the plan.' : 'No workout logged for this day.'}
        </Text>
      </View>
    );
  }

  const totalSets = workout.exercises.reduce(
    (a: number, e: any) => a + e.sets.length,
    0
  );
  const muscles = Array.from(
    new Set(
      workout.exercises
        .map((pe: any) => getExerciseById(pe.exerciseId)?.muscleGroup)
        .filter(Boolean) as string[]
    )
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTopRow}>
          <View style={styles.heroBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#fff" />
            <Text style={styles.heroBadgeText}>COMPLETED</Text>
          </View>
          <Text style={styles.heroDuration}>{workout.estMinutes} min</Text>
        </View>
        <Text style={styles.heroTitle}>{workout.title}</Text>
        <View style={styles.heroMuscles}>
          {muscles.map((m) => (
            <View key={m} style={styles.muscleChip}>
              <Text style={styles.muscleChipText}>{m}</Text>
            </View>
          ))}
        </View>
        <View style={styles.heroStatsRow}>
          <Stat label="Exercises" value={`${workout.exercises.length}`} />
          <View style={styles.statDivider} />
          <Stat label="Sets" value={`${totalSets}`} />
          <View style={styles.statDivider} />
          <Stat
            label="Volume"
            value={`${estimateVolume(workout).toLocaleString()}`}
            unit={units}
          />
        </View>
      </View>

      <Text style={styles.listHeading}>Exercises</Text>
      <View style={{ gap: spacing.sm }}>
        {workout.exercises.map((pe: any, i: number) => {
          const ex = getExerciseById(pe.exerciseId);
          if (!ex) return null;
          return (
            <View key={pe.exerciseId} style={styles.exRow}>
              <View style={styles.exIconBubble}>
                <MuscleIcon muscle={ex.muscleGroup} size={40} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.exName} numberOfLines={1}>
                  {i + 1}. {ex.name}
                </Text>
                <Text style={styles.exMeta}>
                  {ex.equipment} · {ex.muscleGroup}
                </Text>
              </View>
              <View style={styles.loadChip}>
                <Text style={styles.loadReps}>{pe.sets[0].targetReps}</Text>
                <Text style={styles.loadMul}>×</Text>
                <Text style={styles.loadWeight}>
                  {pe.sets[0].weight > 0 ? `${pe.sets[0].weight}${units}` : 'BW'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function estimateVolume(w: any) {
  return w.exercises.reduce(
    (sum: number, pe: any) =>
      sum + pe.sets.reduce((s: number, set: any) => s + set.targetReps * set.weight, 0),
    0
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.statValue}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CaloriesView({
  consumed,
  entries,
  dayLabel,
}: {
  consumed: { kcal: number; protein: number; carbs: number; fat: number };
  entries: FoodIntakeEntry[];
  dayLabel: string;
}) {
  const { dailyKcal, proteinG, carbsG, fatG } = mockCalorieGoal;
  const kcalLeft = Math.max(dailyKcal - consumed.kcal, 0);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.totalCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bigNum}>{consumed.kcal.toLocaleString()}</Text>
          <Text style={styles.bigLabel}>Calories consumed</Text>
          <Text style={styles.bigSub}>
            Goal: {dailyKcal.toLocaleString()} · Left: {kcalLeft.toLocaleString()}
          </Text>
        </View>
        <Ring
          size={100}
          stroke={12}
          progress={Math.min(consumed.kcal / dailyKcal, 1)}
          color={colors.warning}
          trackColor={colors.surfaceElevated}
        >
          <Text style={{ fontSize: 26 }}>🔥</Text>
        </Ring>
      </View>

      <View style={styles.macroRow}>
        <MacroMini label="Protein" value={consumed.protein} goal={proteinG} color="#E04545" />
        <MacroMini label="Carbs" value={consumed.carbs} goal={carbsG} color="#25B572" />
        <MacroMini label="Fat" value={consumed.fat} goal={fatG} color="#E4A62F" />
      </View>

      <Text style={styles.listHeading}>Food intake</Text>
      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="camera-outline" size={24} color={colors.textMuted} />
          <Text style={styles.emptyText}>No meals logged for {dayLabel}.</Text>
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {entries.map((e) => <FoodCard key={e.id} entry={e} />)}
        </View>
      )}
    </View>
  );
}

function MacroMini({
  label,
  value,
  goal,
  color,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
}) {
  const progress = Math.min(value / goal, 1);
  return (
    <View style={styles.macroMini}>
      <Ring
        size={50}
        stroke={5}
        progress={progress}
        color={color}
        trackColor={colors.surfaceElevated}
      >
        <Text style={styles.macroMiniValue}>{value}</Text>
      </Ring>
      <Text style={styles.macroMiniLabel}>{label}</Text>
    </View>
  );
}

function FoodCard({ entry }: { entry: FoodIntakeEntry }) {
  return (
    <View style={styles.foodCard}>
      <View style={styles.foodImgWrap}>
        {entry.imageUrl ? (
          <Image source={{ uri: entry.imageUrl }} style={styles.foodImg} resizeMode="cover" />
        ) : (
          <View style={[styles.foodImg, { backgroundColor: entry.thumbnailColor, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 36 }}>{entry.emoji}</Text>
          </View>
        )}
        <View style={styles.foodKcalBadge}>
          <Text style={styles.foodKcalNum}>{entry.kcal}</Text>
          <Text style={styles.foodKcalUnit}>kcal</Text>
        </View>
      </View>
      <View style={styles.foodBody}>
        <View style={{ flex: 1 }}>
          <Text style={styles.foodTitle} numberOfLines={1}>{entry.title}</Text>
          <Text style={styles.foodTime}>{entry.time}</Text>
        </View>
        <View style={styles.foodMacros}>
          <MacroPill letter="P" value={entry.proteinG} color="#E04545" />
          <MacroPill letter="C" value={entry.carbsG} color="#25B572" />
          <MacroPill letter="F" value={entry.fatG} color="#E4A62F" />
        </View>
      </View>
    </View>
  );
}

function MacroPill({ letter, value, color }: { letter: string; value: number; color: string }) {
  return (
    <View style={styles.macroPill}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroPillLetter}>{letter}</Text>
      <Text style={styles.macroPillValue}>{value}g</Text>
    </View>
  );
}

function Ring({
  size, stroke, progress, color, trackColor, children,
}: {
  size: number; stroke: number; progress: number; color: string; trackColor: string;
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
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
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
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}

const toggle = StyleSheet.create({
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
  seg: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    zIndex: 1,
  },
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
  },
  labelActive: { color: '#fff' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  back: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDay: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.5,
  },
  headerDate: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: 1,
  },
  toggleWrap: {
    paddingVertical: spacing.sm,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
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
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill,
  },
  heroBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  heroDuration: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 13 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.3, marginTop: spacing.md, lineHeight: 30 },
  heroMuscles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  muscleChip: { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  muscleChipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  heroStatsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg,
  },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.35)' },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  statUnit: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  statLabel: { marginTop: 2, color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  listHeading: { ...typography.label, color: colors.textMuted, marginTop: spacing.md, marginLeft: spacing.xs, marginBottom: spacing.xs },
  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.card, padding: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft,
  },
  exIconBubble: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  exName: { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  exMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1, fontWeight: '500' },
  loadChip: {
    flexDirection: 'row', alignItems: 'baseline',
    backgroundColor: colors.surface,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
  },
  loadReps: { fontSize: 14, fontWeight: '800', color: colors.text },
  loadMul: { fontSize: 11, color: colors.textMuted, marginHorizontal: 4, fontWeight: '700' },
  loadWeight: { fontSize: 13, fontWeight: '700', color: colors.accent },
  empty: {
    alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg,
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.borderSoft, gap: spacing.sm,
  },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  emptyTitle: { ...typography.title, fontSize: 18 },
  emptyText: { ...typography.bodyMuted, textAlign: 'center', fontSize: 14 },
  totalCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radius.xl,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSoft,
    gap: spacing.md,
  },
  bigNum: { fontSize: 40, fontWeight: '900', color: colors.text, letterSpacing: -1.2, lineHeight: 44 },
  bigLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '600', marginTop: 2 },
  bigSub: { fontSize: 11, color: colors.textDim, marginTop: spacing.xs, fontWeight: '500' },
  macroRow: { flexDirection: 'row', gap: spacing.sm },
  macroMini: {
    flex: 1, backgroundColor: colors.card,
    borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.borderSoft,
    alignItems: 'center', gap: spacing.xs,
  },
  macroMiniValue: { fontSize: 13, fontWeight: '800', color: colors.text },
  macroMiniLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '700' },
  foodCard: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden',
  },
  foodImgWrap: { height: 140, position: 'relative', backgroundColor: colors.surfaceElevated },
  foodImg: { width: '100%', height: '100%' },
  foodKcalBadge: {
    position: 'absolute', top: spacing.sm, right: spacing.sm,
    backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.pill, flexDirection: 'row', alignItems: 'baseline', gap: 3,
  },
  foodKcalNum: { fontSize: 13, fontWeight: '900', color: colors.text },
  foodKcalUnit: { fontSize: 9, fontWeight: '700', color: colors.textMuted },
  foodBody: { flexDirection: 'row', padding: spacing.md, alignItems: 'center', gap: spacing.sm },
  foodTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  foodTime: { fontSize: 11, color: colors.textMuted, fontWeight: '600', marginTop: 2 },
  foodMacros: { flexDirection: 'row', gap: 4 },
  macroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: radius.pill, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  macroDot: { width: 6, height: 6, borderRadius: 3 },
  macroPillLetter: { fontSize: 10, fontWeight: '800', color: colors.textMuted },
  macroPillValue: { fontSize: 11, fontWeight: '800', color: colors.text },
});

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/theme';
import { MuscleIcon } from '@/components/MuscleIcon';
import { mockPlan } from '@/data/mockPlan';
import { getExerciseById } from '@/data/mockExercises';
import { useUser } from '@/context/UserContext';
import { ProgressStackParamList } from '@/navigation/ProgressStack';

type Rt = RouteProp<ProgressStackParamList, 'DayDetail'>;

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

  const date = new Date(route.params.iso);
  const dayLabel = WEEKDAYS[date.getDay()];
  const longDay = LONGDAYS[date.getDay()];

  const workout = mockPlan.workouts.find((w) => w.dayLabel === dayLabel);
  const isRest = mockPlan.restDays.includes(dayLabel);

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

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <WorkoutsView workout={workout} isRest={isRest} units={user.units} />
      </ScrollView>
    </SafeAreaView>
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
});

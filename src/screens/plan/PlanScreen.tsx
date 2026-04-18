import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Card } from '@/components/Card';
import { SectionHeader } from '@/components/SectionHeader';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Pill } from '@/components/Pill';
import { colors, radius, spacing, typography } from '@/theme';
import { mockPlan, mockCalorieGoal, getTodaysWorkout } from '@/data/mockPlan';
import { getExerciseById } from '@/data/mockExercises';
import { useUser } from '@/context/UserContext';
import { PlanStackParamList } from '@/navigation/PlanStack';

type Nav = NativeStackNavigationProp<PlanStackParamList, 'PlanHome'>;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function PlanScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useUser();
  const todays = getTodaysWorkout();

  const totalSets = todays.exercises.reduce(
    (acc, e) => acc + e.sets.length,
    0
  );

  const { dailyKcal, proteinG, carbsG, fatG } = mockCalorieGoal;
  const totalMacroG = proteinG + carbsG + fatG;
  const proteinPct = (proteinG / totalMacroG) * 100;
  const carbsPct = (carbsG / totalMacroG) * 100;
  const fatPct = (fatG / totalMacroG) * 100;

  return (
    <ScreenContainer scroll>
      <Text style={typography.heading}>Your plan</Text>
      <Text style={[typography.bodyMuted, { marginTop: 4 }]}>
        Built by Homie. Adjusts when you ask.
      </Text>

      <SectionHeader title="Today" subtitle={todays.title} />

      <Card>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <Text style={typography.label}>Exercises</Text>
            <Text style={typography.title}>{todays.exercises.length}</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={typography.label}>Sets</Text>
            <Text style={typography.title}>{totalSets}</Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={typography.label}>Est. time</Text>
            <Text style={typography.title}>{todays.estMinutes} min</Text>
          </View>
        </View>

        <View style={styles.exerciseList}>
          {todays.exercises.map((pe, i) => {
            const ex = getExerciseById(pe.exerciseId);
            if (!ex) return null;
            return (
              <View key={pe.exerciseId} style={styles.exerciseRow}>
                <View
                  style={[
                    styles.exerciseDot,
                    { backgroundColor: ex.thumbnailColor },
                  ]}
                >
                  <Text style={styles.exerciseDotText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={typography.subtitle}>{ex.name}</Text>
                  <Text style={typography.caption}>
                    {pe.sets.length} × {pe.sets[0].targetReps} @ {pe.sets[0].weight}
                    {user.units}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <PrimaryButton
            title="Start workout"
            icon="play"
            onPress={() =>
              nav.navigate('WorkoutSession', { workoutId: todays.id })
            }
          />
          <PrimaryButton
            title="Ask Homie to adjust"
            icon="chatbubble-ellipses"
            variant="secondary"
            onPress={() => {}}
          />
        </View>
      </Card>

      <SectionHeader title="This week" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
      >
        {WEEKDAYS.map((day) => {
          const workout = mockPlan.workouts.find((w) => w.dayLabel === day);
          const isRest = mockPlan.restDays.includes(day);
          return (
            <Pill
              key={day}
              label={`${day}${workout ? ' ·' : ''}${workout ? ' ' + workout.title.split('—')[0].trim() : isRest ? ' · Rest' : ''}`}
              active={day === todays.dayLabel}
              onPress={() => {}}
            />
          );
        })}
      </ScrollView>

      <SectionHeader title="Nutrition goals" subtitle="Daily targets" />
      <Card>
        <View style={styles.calorieTop}>
          <View>
            <Text style={typography.label}>Daily target</Text>
            <Text style={typography.stat}>{dailyKcal.toLocaleString()}</Text>
            <Text style={typography.bodyMuted}>kcal</Text>
          </View>
          <View style={styles.calorieBadge}>
            <Ionicons name="flame" size={18} color={colors.warning} />
            <Text style={styles.calorieBadgeText}>On target</Text>
          </View>
        </View>

        <View style={styles.macroBar}>
          <View style={[styles.macroSlice, { flex: proteinPct, backgroundColor: colors.accent }]} />
          <View style={[styles.macroSlice, { flex: carbsPct, backgroundColor: colors.success }]} />
          <View style={[styles.macroSlice, { flex: fatPct, backgroundColor: colors.warning }]} />
        </View>

        <View style={styles.macroLegend}>
          <MacroLegend color={colors.accent} label="Protein" value={`${proteinG}g`} />
          <MacroLegend color={colors.success} label="Carbs" value={`${carbsG}g`} />
          <MacroLegend color={colors.warning} label="Fat" value={`${fatG}g`} />
        </View>
      </Card>
    </ScreenContainer>
  );
}

function MacroLegend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.macroLegendItem}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <View>
        <Text style={typography.caption}>{label}</Text>
        <Text style={typography.subtitle}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryCol: { flex: 1 },
  exerciseList: { marginTop: spacing.lg, gap: spacing.md },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  exerciseDot: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseDotText: { color: '#fff', fontWeight: '700' },
  calorieTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calorieBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calorieBadgeText: { ...typography.caption, color: colors.text, fontSize: 12 },
  macroBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  macroSlice: { height: 10 },
  macroLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  macroLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  macroDot: { width: 10, height: 10, borderRadius: 5 },
});

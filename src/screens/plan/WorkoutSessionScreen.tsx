import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/theme';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SetRow } from '@/components/SetRow';
import { VoiceButton } from '@/components/VoiceButton';
import { getTodaysWorkout } from '@/data/mockPlan';
import { getExerciseById } from '@/data/mockExercises';
import { useUser } from '@/context/UserContext';
import { PlannedSet } from '@/types';
import { PlanStackParamList } from '@/navigation/PlanStack';

type Nav = NativeStackNavigationProp<PlanStackParamList, 'WorkoutSession'>;

const REST_SECONDS = 90;

export function WorkoutSessionScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useUser();
  const workout = useMemo(() => getTodaysWorkout(), []);
  const [exerciseIdx, setExerciseIdx] = useState(0);
  const [sets, setSets] = useState<PlannedSet[][]>(() =>
    workout.exercises.map((e) => e.sets.map((s) => ({ ...s })))
  );
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (restRemaining === null) return;
    timerRef.current = setInterval(() => {
      setRestRemaining((r) => {
        if (r === null) return r;
        if (r <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return null;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [restRemaining !== null]);

  const currentExercise = workout.exercises[exerciseIdx];
  const exerciseMeta = getExerciseById(currentExercise.exerciseId);
  const currentSets = sets[exerciseIdx];
  const completedSets = currentSets.filter((s) => s.completed).length;
  const progress = (exerciseIdx + completedSets / currentSets.length) / workout.exercises.length;

  const onChangeReps = (setIdx: number, reps: number) => {
    setSets((prev) =>
      prev.map((group, gi) =>
        gi === exerciseIdx
          ? group.map((s, i) => (i === setIdx ? { ...s, achievedReps: reps } : s))
          : group
      )
    );
  };

  const onToggleComplete = (setIdx: number) => {
    setSets((prev) =>
      prev.map((group, gi) =>
        gi === exerciseIdx
          ? group.map((s, i) => {
              if (i !== setIdx) return s;
              const nowCompleted = !s.completed;
              return {
                ...s,
                completed: nowCompleted,
                achievedReps: s.achievedReps ?? s.targetReps,
              };
            })
          : group
      )
    );
    setRestRemaining(REST_SECONDS);
  };

  const goNextExercise = () => {
    if (exerciseIdx < workout.exercises.length - 1) {
      setExerciseIdx((i) => i + 1);
      setRestRemaining(null);
    } else {
      endWorkout();
    }
  };

  const endWorkout = () => {
    Alert.alert(
      'End workout?',
      'Homie will summarize today and update your history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: () => nav.goBack(),
        },
      ]
    );
  };

  if (!exerciseMeta) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={styles.progressWrap}>
        <View style={styles.progressBg}>
          <View
            style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]}
          />
        </View>
        <Text style={typography.caption}>
          Exercise {exerciseIdx + 1} of {workout.exercises.length}
        </Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroStrip, { backgroundColor: exerciseMeta.thumbnailColor }]}>
          <View style={{ flex: 1 }}>
            <Text style={typography.label}>Now lifting</Text>
            <Text style={[typography.heading, { color: '#fff' }]}>
              {exerciseMeta.name}
            </Text>
            <Text style={[typography.caption, { color: 'rgba(255,255,255,0.8)' }]}>
              {exerciseMeta.muscleGroup} · {exerciseMeta.equipment}
            </Text>
          </View>
          <Ionicons name="play-circle" size={40} color="rgba(255,255,255,0.9)" />
        </View>

        <Text style={[typography.label, { marginTop: spacing.lg }]}>Sets</Text>
        <View style={{ marginTop: spacing.sm }}>
          {currentSets.map((s, i) => (
            <SetRow
              key={s.id}
              index={i}
              targetReps={s.targetReps}
              weight={s.weight}
              achievedReps={s.achievedReps}
              completed={s.completed}
              units={user.units}
              onChangeReps={(reps) => onChangeReps(i, reps)}
              onToggleComplete={() => onToggleComplete(i)}
            />
          ))}
        </View>

        {restRemaining !== null && (
          <View style={styles.restBox}>
            <View style={{ flex: 1 }}>
              <Text style={typography.label}>Rest</Text>
              <Text style={typography.heading}>
                {Math.floor(restRemaining / 60)}:
                {String(restRemaining % 60).padStart(2, '0')}
              </Text>
            </View>
            <PrimaryButton
              title="Skip"
              variant="secondary"
              full={false}
              onPress={() => setRestRemaining(null)}
            />
          </View>
        )}

        <View style={styles.actionRow}>
          <PrimaryButton
            title={
              exerciseIdx < workout.exercises.length - 1
                ? 'Next exercise'
                : 'Finish workout'
            }
            icon="arrow-forward"
            onPress={goNextExercise}
          />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <PrimaryButton
          title="End workout"
          variant="secondary"
          icon="stop-circle"
          full={false}
          onPress={endWorkout}
          style={{ flex: 1 }}
        />
        <VoiceButton size={52} onPress={() => {}} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  progressWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  progressBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: colors.accent },
  heroStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  restBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.accent,
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  actionRow: { marginTop: spacing.xl },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});

import { useEffect, useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, WheelRow, NumberWheel, WheelUnit, WHEEL_HEIGHT } from '@/components/ui';
import { Units } from '@/types';

interface Props {
  index: number;
  targetReps: number;
  weight: number;
  achievedReps?: number;
  completed?: boolean;
  /** The set the lifter is on — gets the highlight treatment. */
  isCurrent?: boolean;
  units: Units;
  /** Open state of the weight wheel — controlled by the screen (one at a time). */
  weightExpanded?: boolean;
  onPressWeight?: () => void;
  onChangeWeight?: (weight: number) => void;
  onChangeReps: (reps: number) => void;
  onToggleComplete: () => void;
}

const WEIGHT_STEP = 2.5; // the real-world plate/dumbbell increment, kg or lbs
const formatWeight = (n: number) => (n === 0 ? 'BW' : String(n));

/**
 * One set in the live session. Steppers instead of a keyboard — nobody wants
 * to type mid-workout — big thumb-sized check, and the load accordions open
 * to a wheel so weight can be changed without asking the coach.
 */
export function SetRow({
  index,
  targetReps,
  weight,
  achievedReps,
  completed,
  isCurrent = false,
  units,
  weightExpanded = false,
  onPressWeight,
  onChangeWeight,
  onChangeReps,
  onToggleComplete,
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const reps = achievedReps ?? targetReps;

  const step = (delta: number) => {
    onChangeReps(Math.max(0, reps + delta));
  };

  // Accordion well for the weight wheel (SettingsKit's WheelRow register).
  const progress = useSharedValue(weightExpanded ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(weightExpanded ? 1 : 0, {
      duration: reduceMotion ? 0 : 220,
    });
  }, [weightExpanded, progress, reduceMotion]);
  const wellStyle = useAnimatedStyle(() => ({
    height: progress.value * (WHEEL_HEIGHT + spacing.md * 2),
    opacity: progress.value,
  }));

  // Mount the wheel only while its well is (or is animating) open, so a set
  // list never carries a stack of idle 200pt scroll views.
  const [renderWheel, setRenderWheel] = useState(weightExpanded);
  useEffect(() => {
    if (weightExpanded) {
      setRenderWheel(true);
      return;
    }
    const t = setTimeout(() => setRenderWheel(false), 260);
    return () => clearTimeout(t);
  }, [weightExpanded]);

  // The wheel walks 2.5s; a voice-logged odd weight (say 47) snaps to the
  // nearest tick for display only — nothing commits until the user scrolls.
  const wheelMax = units === 'kg' ? 300 : 500;
  const snappedWeight = Math.min(
    wheelMax,
    Math.max(0, Math.round(weight / WEIGHT_STEP) * WEIGHT_STEP),
  );

  return (
    <View
      style={[
        styles.card,
        completed && styles.rowCompleted,
        isCurrent && !completed && styles.rowCurrent,
        !isCurrent && !completed && styles.rowUpcoming,
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.setNum, completed && styles.setNumCompleted]}>
          <AppText
            variant="caption"
            color={completed ? 'textInverse' : isCurrent ? 'accentText' : 'textSecondary'}
          >
            {index + 1}
          </AppText>
        </View>

        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            onPressWeight?.();
          }}
          disabled={!onPressWeight || completed}
          hitSlop={8}
          style={({ pressed }) => [styles.loadBlock, pressed && styles.loadPressed]}
          accessibilityRole="button"
          accessibilityState={{ expanded: weightExpanded }}
          accessibilityLabel={`Weight, ${weight > 0 ? `${weight} ${units}` : 'bodyweight'}`}
        >
          <AppText variant="bodyMedium" style={styles.tabular}>
            {weight > 0 ? `${weight} ${units}` : 'Bodyweight'}
          </AppText>
          <AppText variant="caption">Target {targetReps} reps</AppText>
        </Pressable>

        {/* Reps stepper */}
        <View style={styles.stepper}>
          <Pressable
            onPress={() => step(-1)}
            hitSlop={6}
            style={styles.stepBtn}
            disabled={completed}
          >
            <Ionicons
              name="remove"
              size={16}
              color={completed ? colors.textTertiary : colors.textPrimary}
            />
          </Pressable>
          <AppText variant="bodyMedium" style={[styles.repsValue, styles.tabular]}>
            {reps}
          </AppText>
          <Pressable
            onPress={() => step(1)}
            hitSlop={6}
            style={styles.stepBtn}
            disabled={completed}
          >
            <Ionicons
              name="add"
              size={16}
              color={completed ? colors.textTertiary : colors.textPrimary}
            />
          </Pressable>
        </View>

        <Pressable
          onPress={onToggleComplete}
          hitSlop={4}
          style={[styles.check, completed && styles.checkDone]}
        >
          <Ionicons
            name="checkmark"
            size={22}
            color={completed ? colors.textInverse : colors.textTertiary}
          />
        </Pressable>
      </View>

      <Animated.View style={[styles.wheelWell, wellStyle]}>
        {renderWheel ? (
          <View style={styles.wheelWellInner}>
            <WheelRow>
              <NumberWheel
                min={0}
                max={wheelMax}
                step={WEIGHT_STEP}
                value={snappedWeight}
                onChange={(w) => onChangeWeight?.(w)}
                format={formatWeight}
                width={96}
                showBand={false}
                accessibilityLabel="Set weight"
              />
              <WheelUnit label={units} />
            </WheelRow>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.colors.card,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...t.shadows.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  rowCompleted: {
    backgroundColor: t.colors.successSoft,
  },
  rowCurrent: {
    borderColor: t.colors.accent,
  },
  rowUpcoming: {
    opacity: 0.65,
  },
  setNum: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: t.colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNumCompleted: { backgroundColor: t.colors.success },
  loadBlock: { flex: 1, gap: 1 },
  loadPressed: { opacity: 0.6 },
  tabular: { fontVariant: ['tabular-nums'] },
  wheelWell: {
    overflow: 'hidden',
    backgroundColor: t.colors.bgSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  wheelWellInner: {
    height: WHEEL_HEIGHT + spacing.md * 2,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.colors.bgSubtle,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: t.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...t.shadows.xs,
  },
  repsValue: {
    minWidth: 34,
    textAlign: 'center',
  },
  check: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: t.colors.border,
    backgroundColor: t.colors.card,
  },
  checkDone: {
    backgroundColor: t.colors.success,
    borderColor: t.colors.success,
  },
}));

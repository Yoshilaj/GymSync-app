import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from '@/components/ui';
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
  onChangeReps: (reps: number) => void;
  onToggleComplete: () => void;
}

/**
 * One set in the live session. Steppers instead of a keyboard — nobody wants
 * to type mid-workout — and a big thumb-sized check.
 */
export function SetRow({
  index,
  targetReps,
  weight,
  achievedReps,
  completed,
  isCurrent = false,
  units,
  onChangeReps,
  onToggleComplete,
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const reps = achievedReps ?? targetReps;

  const step = (delta: number) => {
    onChangeReps(Math.max(0, reps + delta));
  };

  return (
    <View
      style={[
        styles.row,
        completed && styles.rowCompleted,
        isCurrent && !completed && styles.rowCurrent,
        !isCurrent && !completed && styles.rowUpcoming,
      ]}
    >
      <View style={[styles.setNum, completed && styles.setNumCompleted]}>
        <AppText
          variant="caption"
          color={completed ? 'textInverse' : isCurrent ? 'accentText' : 'textSecondary'}
        >
          {index + 1}
        </AppText>
      </View>

      <View style={styles.loadBlock}>
        <AppText variant="bodyMedium" style={styles.tabular}>
          {weight > 0 ? `${weight} ${units}` : 'Bodyweight'}
        </AppText>
        <AppText variant="caption">Target {targetReps} reps</AppText>
      </View>

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
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: t.colors.card,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...t.shadows.xs,
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
  tabular: { fontVariant: ['tabular-nums'] },
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

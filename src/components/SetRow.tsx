import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme';
import { Units } from '@/types';

interface Props {
  index: number;
  targetReps: number;
  weight: number;
  achievedReps?: number;
  completed?: boolean;
  units: Units;
  onChangeReps: (reps: number) => void;
  onToggleComplete: () => void;
}

export function SetRow({
  index,
  targetReps,
  weight,
  achievedReps,
  completed,
  units,
  onChangeReps,
  onToggleComplete,
}: Props) {
  return (
    <View style={[styles.row, completed && styles.rowCompleted]}>
      <Text style={styles.index}>{index + 1}</Text>
      <View style={styles.col}>
        <Text style={styles.label}>Weight</Text>
        <Text style={styles.value}>
          {weight} <Text style={styles.unit}>{units}</Text>
        </Text>
      </View>
      <View style={styles.col}>
        <Text style={styles.label}>Target</Text>
        <Text style={styles.value}>{targetReps} reps</Text>
      </View>
      <View style={styles.col}>
        <Text style={styles.label}>Done</Text>
        <TextInput
          keyboardType="number-pad"
          value={achievedReps !== undefined ? String(achievedReps) : ''}
          onChangeText={(t) => {
            const n = parseInt(t, 10);
            onChangeReps(isNaN(n) ? 0 : n);
          }}
          placeholder={String(targetReps)}
          placeholderTextColor={colors.textDim}
          style={styles.input}
        />
      </View>
      <Pressable
        onPress={onToggleComplete}
        style={[styles.check, completed && styles.checkDone]}
      >
        <Ionicons
          name={completed ? 'checkmark' : 'ellipse-outline'}
          size={22}
          color={completed ? '#fff' : colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  rowCompleted: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceElevated,
  },
  index: {
    ...typography.subtitle,
    color: colors.textMuted,
    width: 22,
    textAlign: 'center',
  },
  col: { flex: 1 },
  label: { ...typography.label, fontSize: 10, marginBottom: 2 },
  value: { ...typography.subtitle, fontSize: 15 },
  unit: { ...typography.caption, fontSize: 12 },
  input: {
    ...typography.subtitle,
    fontSize: 15,
    color: colors.text,
    padding: 0,
  },
  check: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});

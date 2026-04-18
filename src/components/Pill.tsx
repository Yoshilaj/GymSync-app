import { Pressable, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

interface Props {
  label: string;
  active?: boolean;
  onPress: () => void;
}

export function Pill({ label, active, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active && styles.pillActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pressed: { opacity: 0.8 },
  label: { ...typography.caption, color: colors.text, fontSize: 13 },
  labelActive: { color: '#fff', fontWeight: '700' },
});

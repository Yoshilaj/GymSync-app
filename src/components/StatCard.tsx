import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme';

interface Props {
  label: string;
  value: string | number;
  unit?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'default' | 'accent' | 'success';
}

export function StatCard({ label, value, unit, icon, tone = 'default' }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={typography.label}>{label}</Text>
        {icon && (
          <Ionicons
            name={icon}
            size={16}
            color={
              tone === 'accent'
                ? colors.accent
                : tone === 'success'
                ? colors.success
                : colors.textMuted
            }
          />
        )}
      </View>
      <View style={styles.row}>
        <Text
          style={[
            typography.stat,
            tone === 'accent' && { color: colors.accent },
            tone === 'success' && { color: colors.success },
          ]}
        >
          {value}
        </Text>
        {unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  unit: {
    ...typography.caption,
    marginLeft: 4,
    marginBottom: 6,
  },
});

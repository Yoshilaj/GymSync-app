import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, typography } from '@/theme';

interface Props {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={typography.title}>{title}</Text>
        {subtitle && <Text style={[typography.caption, styles.subtitle]}>{subtitle}</Text>}
      </View>
      {actionLabel && onAction && (
        <Pressable onPress={onAction}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  textCol: { flex: 1 },
  subtitle: { marginTop: 2 },
  action: {
    ...typography.subtitle,
    color: colors.accent,
    fontSize: 15,
  },
});

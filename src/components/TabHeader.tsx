import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@/theme';

interface Props {
  title: string;
  subtitle?: string;
}

export function TabHeader({ title, subtitle }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...typography.heading,
    textAlign: 'center',
    color: colors.text,
  },
  subtitle: {
    ...typography.bodyMuted,
    textAlign: 'center',
    marginTop: 4,
  },
});

import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, useTheme } from '@/theme';
import { AppText, Card, Chip } from '@/components/ui';

interface Props {
  title: string;
  subtitle?: string;
  /** e.g. the exercise picker entry point. */
  action?: { label: string; onPress: () => void };
  /** Small trailing chip — used to flag "Sample data" while charts are mock. */
  chip?: string;
  children: ReactNode;
}

/** Themed wrapper for react-native-gifted-charts blocks. */
export function ChartCard({ title, subtitle, action, chip, children }: Props) {
  const { colors } = useTheme();
  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <AppText variant="h3">{title}</AppText>
            {chip ? <Chip label={chip} size="sm" /> : null}
          </View>
          {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
        </View>
        {action && (
          <Pressable onPress={action.onPress} hitSlop={8} style={styles.action}>
            <AppText variant="caption" color="accentText">
              {action.label}
            </AppText>
            <Ionicons name="chevron-forward" size={14} color={colors.accentText} />
          </Pressable>
        )}
      </View>
      <View style={styles.chart}>{children}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleBlock: { flex: 1, gap: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingTop: 2,
  },
  chart: { marginTop: spacing.md },
});

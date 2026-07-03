import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { Card } from './Card';

type Tone = 'default' | 'accent' | 'success' | 'live' | 'warning';

interface Props {
  label: string;
  value: string | number;
  unit?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  trend?: { delta: string; direction: 'up' | 'down' };
}

const TONE_COLORS: Record<Tone, { fg: string; bg: string }> = {
  default: { fg: colors.textSecondary, bg: colors.sunken },
  accent: { fg: colors.accentText, bg: colors.accentSoft },
  success: { fg: colors.successText, bg: colors.successSoft },
  live: { fg: colors.liveText, bg: colors.liveSoft },
  warning: { fg: colors.warningText, bg: colors.warningSoft },
};

export function StatTile({ label, value, unit, icon, tone = 'default', trend }: Props) {
  const toneColor = TONE_COLORS[tone];
  return (
    <Card style={styles.tile} padded={false}>
      {icon ? (
        <View style={[styles.iconWell, { backgroundColor: toneColor.bg }]}>
          <Ionicons name={icon} size={15} color={toneColor.fg} />
        </View>
      ) : null}
      <View style={styles.valueRow}>
        <AppText variant="stat">{value}</AppText>
        {unit ? (
          <AppText variant="caption" style={styles.unit}>
            {unit}
          </AppText>
        ) : null}
      </View>
      <AppText variant="label">{label}</AppText>
      {trend ? (
        <AppText
          variant="caption"
          color={trend.direction === 'up' ? 'successText' : 'dangerText'}
        >
          {trend.direction === 'up' ? '↑' : '↓'} {trend.delta}
        </AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.lg,
  },
  iconWell: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  unit: { marginBottom: 2 },
});

import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { AnimatedPressable } from './AnimatedPressable';

type LeftIcon = {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: 'default' | 'accent' | 'success' | 'live' | 'warning' | 'danger';
};

interface Props {
  title: string;
  subtitle?: string;
  left?: ReactNode | LeftIcon;
  right?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TONE_COLORS = {
  default: { fg: colors.textSecondary, bg: colors.sunken },
  accent: { fg: colors.accentText, bg: colors.accentSoft },
  success: { fg: colors.successText, bg: colors.successSoft },
  live: { fg: colors.liveText, bg: colors.liveSoft },
  warning: { fg: colors.warningText, bg: colors.warningSoft },
  danger: { fg: colors.dangerText, bg: colors.dangerSoft },
} as const;

function isLeftIcon(left: Props['left']): left is LeftIcon {
  return !!left && typeof left === 'object' && 'icon' in (left as object);
}

export function ListRow({
  title,
  subtitle,
  left,
  right,
  chevron = false,
  onPress,
  selected = false,
  style,
}: Props) {
  const leftNode = isLeftIcon(left) ? (
    <View
      style={[
        styles.iconWell,
        { backgroundColor: TONE_COLORS[left.tone ?? 'default'].bg },
      ]}
    >
      <Ionicons
        name={left.icon}
        size={17}
        color={TONE_COLORS[left.tone ?? 'default'].fg}
      />
    </View>
  ) : (
    (left as ReactNode)
  );

  const body = (
    <View style={[styles.row, selected && styles.selected, style]}>
      {leftNode}
      <View style={styles.textBlock}>
        <AppText variant="h3" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
      {selected ? (
        <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
      ) : chevron ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return <AnimatedPressable onPress={onPress}>{body}</AnimatedPressable>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  selected: { backgroundColor: colors.accentFaint },
  iconWell: {
    width: 34,
    height: 34,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1, gap: spacing.xxs },
});

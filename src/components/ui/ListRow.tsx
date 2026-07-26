import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, radius, spacing, useTheme, type Theme } from '@/theme';
import { AppText } from './AppText';
import { AnimatedPressable } from './AnimatedPressable';

type Tone = 'default' | 'accent' | 'success' | 'live' | 'warning' | 'danger';
type LeftIcon = {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
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

function toneColors(t: Theme): Record<Tone, { fg: string; bg: string }> {
  const c = t.colors;
  return {
    default: { fg: c.textSecondary, bg: c.sunken },
    accent: { fg: c.accentText, bg: c.accentSoft },
    success: { fg: c.successText, bg: c.successSoft },
    live: { fg: c.liveText, bg: c.liveSoft },
    warning: { fg: c.warningText, bg: c.warningSoft },
    danger: { fg: c.dangerText, bg: c.dangerSoft },
  };
}

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
  const theme = useTheme();
  const { colors } = theme;
  const styles = useStyles();

  const leftNode = isLeftIcon(left) ? (
    <View
      style={[
        styles.iconWell,
        { backgroundColor: toneColors(theme)[left.tone ?? 'default'].bg },
      ]}
    >
      <Ionicons
        name={left.icon}
        size={17}
        color={toneColors(theme)[left.tone ?? 'default'].fg}
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

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  selected: { backgroundColor: t.colors.accentFaint },
  iconWell: {
    width: 34,
    height: 34,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1, gap: spacing.xxs },
}));

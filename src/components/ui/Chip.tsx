import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from './AppText';

interface Props {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  size?: 'sm' | 'md';
  /** onAccent = translucent white chip for use inside gradient hero cards. */
  tone?: 'default' | 'accent' | 'onAccent';
  style?: StyleProp<ViewStyle>;
}

export function Chip({
  label,
  onPress,
  selected = false,
  icon,
  emoji,
  size = 'md',
  tone = 'default',
  style,
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();

  const labelColor =
    tone === 'onAccent'
      ? colors.textInverse
      : selected
        ? colors.textInverse
        : tone === 'accent'
          ? colors.accentText
          : colors.textSecondary;

  const body = (
    <View
      style={[
        styles.base,
        size === 'sm' && styles.sm,
        tone === 'onAccent'
          ? styles.onAccent
          : selected
            ? styles.selected
            : tone === 'accent'
              ? styles.accent
              : styles.default,
        style,
      ]}
    >
      {emoji ? (
        <AppText variant="caption" color={labelColor}>
          {emoji}
        </AppText>
      ) : null}
      {icon ? (
        <Ionicons name={icon} size={size === 'sm' ? 12 : 14} color={labelColor} />
      ) : null}
      <AppText
        variant="caption"
        color={labelColor}
        style={size === 'sm' && styles.labelSm}
      >
        {label}
      </AppText>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm - 1,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  sm: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm + 2 },
  default: {
    backgroundColor: t.colors.card,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  accent: { backgroundColor: t.colors.accentSoft },
  onAccent: { backgroundColor: t.colors.onBrandOverlay },
  selected: { backgroundColor: t.colors.accent },
  labelSm: { fontSize: 13 },
  pressed: { opacity: 0.8 },
}));

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, shadows, spacing } from '@/theme';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'live';
type Size = 'lg' | 'md' | 'sm';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HEIGHTS: Record<Size, number> = { lg: 52, md: 44, sm: 36 };

const LABEL_COLOR: Record<Variant, string> = {
  primary: colors.textInverse,
  secondary: colors.textPrimary,
  ghost: colors.accentText,
  danger: colors.textInverse,
  live: colors.textInverse,
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  loading,
  disabled,
  full = true,
  style,
}: Props) {
  const isDisabled = disabled || loading;
  const labelColor = LABEL_COLOR[variant];

  const content = loading ? (
    <ActivityIndicator color={labelColor} />
  ) : (
    <>
      {icon && (
        <Ionicons
          name={icon}
          size={size === 'sm' ? 15 : 18}
          color={labelColor}
          style={styles.icon}
        />
      )}
      <AppText
        variant="button"
        color={labelColor}
        style={size === 'sm' && styles.labelSm}
      >
        {title}
      </AppText>
    </>
  );

  const frame: StyleProp<ViewStyle> = [
    styles.base,
    { minHeight: HEIGHTS[size] },
    size === 'sm' && styles.baseSm,
    full && styles.full,
  ];

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.primaryShadow,
          full && styles.full,
          pressed && !isDisabled && styles.pressed,
          isDisabled && styles.disabled,
          style,
        ]}
      >
        <LinearGradient
          colors={gradients.button}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={frame}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        frame,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        variant === 'live' && styles.live,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  baseSm: { paddingHorizontal: spacing.md, borderRadius: radius.sm },
  full: { alignSelf: 'stretch' },
  primaryShadow: { ...shadows.glow, borderRadius: radius.md },
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: { backgroundColor: colors.danger },
  live: { backgroundColor: colors.live },
  icon: { marginRight: spacing.sm },
  labelSm: { fontSize: 15 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
});

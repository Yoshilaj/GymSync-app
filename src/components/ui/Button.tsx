import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from './AppText';

type Variant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'live'
  | 'solid'
  | 'onBrand'
  | 'onBrandGhost';
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
  /** Pill geometry (auth screens) — fully rounded corners. */
  pill?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HEIGHTS: Record<Size, number> = { lg: 52, md: 44, sm: 36 };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  loading,
  disabled,
  full = true,
  pill = false,
  style,
}: Props) {
  const { colors, gradients, scheme } = useTheme();
  const styles = useStyles();
  const isDisabled = disabled || loading;

  const labelColor: string = {
    primary: colors.textInverse,
    secondary: colors.textPrimary,
    ghost: colors.accentText,
    danger: colors.textInverse,
    live: colors.textInverse,
    // solid = quiet ink button: inverse-on-ink in light, primary-on-card in dark.
    solid: scheme === 'dark' ? colors.textPrimary : colors.textInverse,
    // onBrand = white button for brand-filled surfaces, where the gradient
    // `primary` fill would vanish into the background it sits on.
    onBrand: colors.accentText,
    // onBrandGhost = its quiet sibling: outline only, for the secondary action.
    onBrandGhost: colors.textInverse,
  }[variant];

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
    pill && styles.pill,
  ];

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.primaryShadow,
          pill && styles.pill,
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
        variant === 'solid' && styles.solid,
        variant === 'onBrand' && styles.onBrand,
        variant === 'onBrandGhost' && styles.onBrandGhost,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  baseSm: { paddingHorizontal: spacing.md, borderRadius: radius.sm },
  pill: { borderRadius: radius.pill },
  full: { alignSelf: 'stretch' },
  primaryShadow: { ...t.shadows.glow, borderRadius: radius.md },
  secondary: {
    backgroundColor: t.colors.card,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  danger: { backgroundColor: t.colors.danger },
  live: { backgroundColor: t.colors.live },
  // Sophisticated ink button — real shadow, no glow, no gradient.
  solid:
    t.scheme === 'dark'
      ? {
          backgroundColor: t.colors.card,
          borderWidth: 1,
          borderColor: t.colors.borderStrong,
        }
      : { backgroundColor: t.colors.textPrimary, ...t.shadows.sm },
  // White on brand. No glow — a glow needs a surface darker than the button to
  // read against, and here the button is the lightest thing on screen.
  onBrand: { backgroundColor: t.colors.textInverse, ...t.shadows.md },
  onBrandGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: t.colors.textInverse,
  },
  icon: { marginRight: spacing.sm },
  labelSm: { fontSize: 15 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
}));

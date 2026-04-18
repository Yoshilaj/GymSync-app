import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  full?: boolean;
}

export function PrimaryButton({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  full = true,
}: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        full && styles.full,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.accent} />
      ) : (
        <>
          {icon && (
            <Ionicons
              name={icon}
              size={18}
              color={variant === 'primary' ? '#fff' : colors.accent}
              style={{ marginRight: spacing.sm }}
            />
          )}
          <Text
            style={[
              styles.label,
              variant === 'primary' ? styles.labelPrimary : styles.labelSecondary,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    minHeight: 48,
  },
  full: { alignSelf: 'stretch' },
  primary: { backgroundColor: colors.accent },
  secondary: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: { backgroundColor: 'transparent' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  label: { ...typography.subtitle },
  labelPrimary: { color: '#fff' },
  labelSecondary: { color: colors.text },
});

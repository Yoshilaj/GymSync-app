import { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleProp,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from './AppText';

interface Props extends Omit<TextInputProps, 'style'> {
  /** Uppercase eyebrow label rendered above the field. */
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Password-style field with an eye toggle. */
  secure?: boolean;
  /** Paints the border in the danger color. */
  error?: boolean;
  /** Pill geometry (auth screens) — fully rounded, a touch taller. */
  round?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/** The standard text field: bordered card row with a leading icon. */
export const Input = forwardRef<TextInput, Props>(function Input(
  { label, icon, secure = false, error = false, round = false, containerStyle, ...rest },
  ref,
) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const [hidden, setHidden] = useState(true);

  return (
    <View style={containerStyle}>
      {label && (
        <AppText variant="label" style={styles.label}>
          {label}
        </AppText>
      )}
      <View style={[styles.wrap, round && styles.round, error && styles.wrapError]}>
        {icon && <Ionicons name={icon} size={17} color={colors.textSecondary} />}
        <TextInput
          ref={ref}
          style={styles.input}
          placeholderTextColor={colors.textTertiary}
          keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
          secureTextEntry={secure && hidden}
          {...rest}
        />
        {secure && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8}>
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color={colors.textTertiary}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
});

const useStyles = makeStyles((t) => ({
  label: { marginBottom: spacing.xs },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: t.colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: spacing.md,
  },
  round: {
    borderRadius: radius.pill,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  wrapError: { borderColor: t.colors.danger },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: t.colors.textPrimary,
  },
}));

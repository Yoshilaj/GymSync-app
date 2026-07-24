import { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';

interface Props extends Omit<TextInputProps, 'style'> {
  /** Uppercase eyebrow label rendered above the field. */
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Password-style field with an eye toggle. */
  secure?: boolean;
  /** Paints the border in the danger color. */
  error?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

/** The standard text field: bordered card row with a leading icon. */
export const Input = forwardRef<TextInput, Props>(function Input(
  { label, icon, secure = false, error = false, containerStyle, ...rest },
  ref,
) {
  const [hidden, setHidden] = useState(true);

  return (
    <View style={containerStyle}>
      {label && (
        <AppText variant="label" style={styles.label}>
          {label}
        </AppText>
      )}
      <View style={[styles.wrap, error && styles.wrapError]}>
        {icon && <Ionicons name={icon} size={17} color={colors.textSecondary} />}
        <TextInput
          ref={ref}
          style={styles.input}
          placeholderTextColor={colors.textTertiary}
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

const styles = StyleSheet.create({
  label: { marginBottom: spacing.xs },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  wrapError: { borderColor: colors.danger },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: colors.textPrimary,
  },
});

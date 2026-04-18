import { ReactNode } from 'react';
import { View, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@/theme';

interface Props {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  padded?: boolean;
  elevated?: boolean;
}

export function Card({ children, onPress, style, padded = true, elevated }: Props) {
  const containerStyle = [
    styles.base,
    elevated && styles.elevated,
    padded && styles.padded,
    style,
  ];
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [...containerStyle, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={containerStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  elevated: { backgroundColor: colors.surfaceElevated },
  padded: { padding: spacing.lg },
  pressed: { opacity: 0.85 },
});

import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius as radiusTokens, shadows, spacing } from '@/theme';
import { AnimatedPressable } from './AnimatedPressable';

interface Props {
  children: ReactNode;
  onPress?: () => void;
  /** flat = subtle tinted fill, no shadow; raised = default card; floating = hero emphasis. */
  variant?: 'flat' | 'raised' | 'floating';
  padded?: boolean;
  radius?: 'lg' | 'xl';
  style?: StyleProp<ViewStyle>;
}

/** White surface with real elevation — no borders (borders are for inputs). */
export function Card({
  children,
  onPress,
  variant = 'raised',
  padded = true,
  radius = 'lg',
  style,
}: Props) {
  const containerStyle: StyleProp<ViewStyle> = [
    styles.base,
    { borderRadius: radiusTokens[radius] },
    variant === 'flat' && styles.flat,
    variant === 'raised' && styles.raised,
    variant === 'floating' && styles.floating,
    padded && styles.padded,
    style,
  ];
  if (onPress) {
    return (
      <AnimatedPressable onPress={onPress} style={containerStyle}>
        {children}
      </AnimatedPressable>
    );
  }
  return <View style={containerStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.card },
  flat: { backgroundColor: colors.bgSubtle },
  raised: { ...shadows.sm },
  floating: { ...shadows.md },
  padded: { padding: spacing.lg },
});

import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { makeStyles, radius as radiusTokens, spacing } from '@/theme';
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

/**
 * Elevated surface. Light: white + shadow, no border. Dark: shadows barely
 * read, so raised/floating cards gain a hairline border to carry elevation.
 */
export function Card({
  children,
  onPress,
  variant = 'raised',
  padded = true,
  radius = 'lg',
  style,
}: Props) {
  const styles = useStyles();
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

const useStyles = makeStyles((t) => {
  const darkElev =
    t.scheme === 'dark'
      ? { borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border }
      : null;
  return {
    base: { backgroundColor: t.colors.card },
    flat: { backgroundColor: t.colors.bgSubtle },
    raised: { ...t.shadows.sm, ...darkElev },
    floating: { ...t.shadows.md, ...darkElev },
    padded: { padding: spacing.lg },
  };
});

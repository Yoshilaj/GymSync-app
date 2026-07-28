/**
 * Pagination dots for a paged view.
 *
 * The active page widens into a pill rather than just brightening — the shape
 * change survives a glance where a colour change alone doesn't, and it still
 * reads once the dot colour is gone (Reduce Motion, greyscale filters).
 *
 * Colours follow DayStrip's existing dot convention: `borderStrong` at rest,
 * `accent` when current.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

const DOT = 7;
const DOT_ACTIVE_W = 22;

function Dot({ active }: { active: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    const to = active ? 1 : 0;
    t.value = reduceMotion
      ? to
      : withTiming(to, { duration: 220, easing: Easing.out(Easing.quad) });
  }, [active, reduceMotion, t]);

  const rest = colors.borderStrong;
  const on = colors.accent;
  const style = useAnimatedStyle(() => ({
    width: DOT + t.value * (DOT_ACTIVE_W - DOT),
    backgroundColor: interpolateColor(t.value, [0, 1], [rest, on]),
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

interface Props {
  count: number;
  /** Zero-based index of the current page. */
  index: number;
}

export function PageDots({ count, index }: Props) {
  const styles = useStyles();
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Page ${index + 1} of ${count}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} active={i === index} />
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: {
    height: DOT,
    borderRadius: radius.pill,
  },
}));

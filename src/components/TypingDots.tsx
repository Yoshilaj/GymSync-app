import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { makeStyles, radius, spacing } from '@/theme';

function Dot({ delay }: { delay: number }) {
  const styles = useStyles();
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 320, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 320, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 320 }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(t);
  }, [delay, t]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + t.value * 0.75,
    transform: [{ translateY: -2 * t.value }],
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

/** Coach-side "thinking" bubble shown between send and the first token. */
export function TypingDots() {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.bubble}>
        <Dot delay={0} />
        <Dot delay={160} />
        <Dot delay={320} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: spacing.sm,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: t.colors.card,
    borderRadius: radius.lg,
    borderBottomLeftRadius: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...t.shadows.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: t.colors.textTertiary,
  },
}));

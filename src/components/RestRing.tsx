import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/theme';
import { AppText } from '@/components/ui';
import { formatClock } from '@/voice';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** Seconds left. */
  remaining: number;
  /** Seconds the timer started with. */
  duration: number;
  paused?: boolean;
  size?: number;
}

/** Circular rest countdown — the ring drains smoothly as time runs out. */
export function RestRing({ remaining, duration, paused = false, size = 64 }: Props) {
  const strokeWidth = 4;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  const progress = useSharedValue(duration > 0 ? remaining / duration : 0);

  useEffect(() => {
    const target = duration > 0 ? Math.max(0, remaining / duration) : 0;
    // Glide linearly over the next second so the ring drains continuously
    // instead of ticking; jumps (reset, +30s) get the same short glide.
    progress.value = withTiming(target, {
      duration: paused ? 200 : 1000,
      easing: Easing.linear,
    });
  }, [remaining, duration, paused, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.sunken}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={paused ? colors.textTertiary : colors.accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <AppText
          variant="bodyMedium"
          color={paused ? 'textTertiary' : 'textPrimary'}
          style={styles.clock}
        >
          {formatClock(remaining)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clock: { fontVariant: ['tabular-nums'], fontSize: 14 },
});

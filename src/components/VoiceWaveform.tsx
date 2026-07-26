/**
 * Scientific-minimal voice waveform: thin bars mirrored around a center line,
 * scrolling right-to-left as real audio levels stream in (user speech rides
 * the mic PCM at ~62Hz; coach speech rides playback samples). Silent = a thin
 * flat line. All motion is scaleY transforms on plain views — 60fps via
 * Reanimated, no SVG.
 *
 * Color contract (theme): user audio = colors.live (the reserved live-audio
 * orange), coach audio = colors.accent. Pass tokens, never hex.
 */
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius } from '@/theme';
import type { WaveformSource } from '@/voice/levels';

const BAR_WIDTH = 3;
const BAR_GAP = 3;
/** scaleY floor — keeps a visible 2-3px center line when silent. */
const MIN_SCALE = 0.03;

interface Props {
  /** Live level feed; null = nothing playing/listening (flat line). */
  source: WaveformSource | null;
  /** A color token value, e.g. colors.live or colors.accent. */
  color: string;
  /** False decays every bar to the flat line. */
  active: boolean;
  barCount?: number;
  height?: number;
}

function Bar({
  levels,
  index,
  color,
  height,
}: {
  levels: SharedValue<number[]>;
  index: number;
  color: string;
  height: number;
}) {
  const style = useAnimatedStyle(() => {
    const level = levels.value[index] ?? 0;
    return {
      transform: [
        { scaleY: withTiming(Math.max(MIN_SCALE, level), { duration: 90 }) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.bar,
        { height, backgroundColor: color },
        style,
      ]}
    />
  );
}

export const VoiceWaveform = memo(function VoiceWaveform({
  source,
  color,
  active,
  barCount = 48,
  height = 96,
}: Props) {
  const levels = useSharedValue<number[]>(new Array(barCount).fill(0));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!active || !source || reducedMotion) {
      levels.value = new Array(barCount).fill(0);
      return;
    }
    const unsubscribe = source.subscribe((buckets) => {
      const take = Math.min(buckets.length, barCount);
      levels.value = [
        ...levels.value.slice(take),
        ...buckets.slice(0, take),
      ];
    });
    return () => {
      unsubscribe();
      levels.value = new Array(barCount).fill(0);
    };
  }, [source, active, reducedMotion, barCount, levels]);

  // Reduce Motion: a static line + the status text carries the state.
  if (reducedMotion) {
    return (
      <View style={[styles.wrap, { height }]}>
        <View style={[styles.staticLine, { backgroundColor: color }]} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]} pointerEvents="none">
      {Array.from({ length: barCount }, (_, i) => (
        <Bar key={i} levels={levels} index={i} color={color} height={height} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: BAR_GAP,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: radius.pill,
  },
  staticLine: {
    height: 2,
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    opacity: 0.6,
  },
});

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients } from '@/theme';
import type { VoicePhase } from '@/voice/protocol';

interface Props {
  phase: VoicePhase;
  size?: number;
  /** Optional 0–1 speech intensity to scale the speaking bars. */
  intensity?: number;
}

const BAR_COUNT = 4;

/**
 * The coach's visual presence — a native replacement for the old
 * Three.js-in-a-WebView blob (which needed a CDN at workout time).
 * Gradient orb + pulse ring + a small equalizer, driven by the voice phase:
 * idle breathes, connecting pulses the ring, listening pulses it orange,
 * thinking ripples the bars low, speaking animates them tall.
 */
export function CoachOrb({ phase, size = 160, intensity = 1 }: Props) {
  const breath = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const bars = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0)),
  ).current;

  // Core breathing — slow on idle, none while speaking (bars carry the motion).
  useEffect(() => {
    breath.setValue(0);
    if (phase === 'error') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: phase === 'idle' ? 1500 : 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: phase === 'idle' ? 1500 : 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, breath]);

  // Outward ring pulse while connecting / listening.
  const ringActive = phase === 'connecting' || phase === 'listening';
  useEffect(() => {
    ring.setValue(0);
    if (!ringActive) return;
    const loop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [ringActive, ring]);

  // Equalizer bars — tall staggered waves while speaking, a low ripple while thinking.
  const barsActive = phase === 'coach_speaking' || phase === 'thinking';
  useEffect(() => {
    bars.forEach((b) => b.setValue(0));
    if (!barsActive) return;
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 110),
          Animated.timing(b, {
            toValue: 1,
            duration: 320,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(b, {
            toValue: 0,
            duration: 320,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [barsActive, bars]);

  const coreSize = size * 0.62;
  const scale = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [1, phase === 'idle' ? 1.04 : 1.08],
  });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 0] });
  const ringColor = phase === 'listening' ? colors.live : colors.accent;
  const maxBar = coreSize * 0.34 * (phase === 'thinking' ? 0.5 : Math.max(0.3, intensity));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {ringActive && (
        <Animated.View
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: ringColor,
              transform: [{ scale: ringScale }],
              opacity: ringOpacity,
            },
          ]}
        />
      )}
      <Animated.View
        style={[
          {
            width: coreSize,
            height: coreSize,
            borderRadius: coreSize / 2,
            transform: [{ scale }],
          },
          phase === 'error' && styles.coreError,
        ]}
      >
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[styles.core, { borderRadius: coreSize / 2 }]}
        >
          <View style={styles.barsRow}>
            {bars.map((b, i) => {
              const grow = b.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 2.4],
              });
              return (
                <Animated.View
                  key={i}
                  style={[
                    styles.bar,
                    {
                      height: barsActive ? maxBar / 2.4 : coreSize * 0.12 + i * 2,
                      transform: barsActive ? [{ scaleY: grow }] : undefined,
                    },
                  ]}
                />
              );
            })}
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  core: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreError: { opacity: 0.4 },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
});

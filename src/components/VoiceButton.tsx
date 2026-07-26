import { useEffect, useRef } from 'react';
import { Pressable, Animated, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles } from '@/theme';

interface Props {
  onPress: () => void;
  active?: boolean;
  size?: number;
}

export function VoiceButton({ onPress, active = false, size = 64 }: Props) {
  const styles = useStyles();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.wrap}>
      {active && (
        <Animated.View
          style={[
            styles.pulse,
            styles.pulseActive,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              transform: [{ scale }],
              opacity,
            },
          ]}
        />
      )}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
          active ? styles.buttonActive : styles.buttonIdle,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name={active ? 'mic' : 'mic-outline'} size={size * 0.45} color="#fff" />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  pulse: {
    position: 'absolute',
    backgroundColor: t.colors.accent,
  },
  pulseActive: { backgroundColor: t.colors.live },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIdle: {
    backgroundColor: t.colors.accent,
    ...t.shadows.glow,
  },
  buttonActive: {
    backgroundColor: t.colors.live,
    ...t.shadows.glowLive,
  },
  pressed: { opacity: 0.85 },
}));

import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius } from '@/theme';

type Tone = 'accent' | 'success' | 'live';

interface Props {
  /** 0..1 */
  value: number;
  height?: number;
  tone?: Tone;
  /** Use the brand gradient instead of a flat fill. */
  gradient?: boolean;
}

const TONE_FILL: Record<Tone, string> = {
  accent: colors.accent,
  success: colors.success,
  live: colors.live,
};

export function ProgressBar({
  value,
  height = 6,
  tone = 'accent',
  gradient = false,
}: Props) {
  const width = `${Math.min(100, Math.max(0, value * 100))}%` as const;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      {gradient ? (
        <LinearGradient
          colors={gradients.button}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width, borderRadius: height / 2 }]}
        />
      ) : (
        <View
          style={[
            styles.fill,
            { width, borderRadius: height / 2, backgroundColor: TONE_FILL[tone] },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.sunken,
    overflow: 'hidden',
    borderRadius: radius.pill,
  },
  fill: { height: '100%' },
});

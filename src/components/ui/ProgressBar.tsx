import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { makeStyles, radius, useTheme } from '@/theme';

type Tone = 'accent' | 'success' | 'live';

interface Props {
  /** 0..1 */
  value: number;
  height?: number;
  tone?: Tone;
  /** Use the brand gradient instead of a flat fill. */
  gradient?: boolean;
}

export function ProgressBar({
  value,
  height = 6,
  tone = 'accent',
  gradient = false,
}: Props) {
  const { colors, gradients } = useTheme();
  const styles = useStyles();
  const toneFill: Record<Tone, string> = {
    accent: colors.accent,
    success: colors.success,
    live: colors.live,
  };
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
            { width, borderRadius: height / 2, backgroundColor: toneFill[tone] },
          ]}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  track: {
    backgroundColor: t.colors.sunken,
    overflow: 'hidden',
    borderRadius: radius.pill,
  },
  fill: { height: '100%' },
}));

import { StyleSheet, View } from 'react-native';
import { spacing } from '@/theme';
import { AppText } from './AppText';

interface Props {
  seconds: number;
  size?: 'md' | 'lg';
  label?: string;
  state?: 'running' | 'paused';
}

export function formatSeconds(total: number): string {
  const clamped = Math.max(0, Math.round(total));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Monospaced-digit countdown readout (rest timers). */
export function TimerDisplay({ seconds, size = 'lg', label, state = 'running' }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <AppText
        variant={size === 'lg' ? 'timer' : 'stat'}
        color={state === 'paused' ? 'textTertiary' : 'textPrimary'}
      >
        {formatSeconds(seconds)}
      </AppText>
      {state === 'paused' ? (
        <AppText variant="caption" color="textTertiary">
          Paused
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xxs },
});

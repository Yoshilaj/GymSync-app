/**
 * Live password feedback under a password field.
 *
 * Shown only while the field has focus, and it replaces the static hint rather
 * than adding to it — the auth sheet is budgeted to fit one screen without
 * scrolling, so this may not permanently cost height.
 *
 * Four discrete segments rather than a continuous bar: strength is a verdict,
 * not a measurement, and four steps read at a glance the way a percentage
 * never does. One hint line, never a checklist.
 */
import { StyleProp, View, ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from '@/components/ui';
import { checkPassword, type PasswordScore } from '@/lib/passwordStrength';
import type { ColorKey } from '@/theme/colors';

const SEGMENTS = 4;

/** Fill for the bar (graphic) and the matching AA-safe text token. */
const TONES: Record<PasswordScore, { fill: ColorKey; text: ColorKey }> = {
  0: { fill: 'danger', text: 'dangerText' },
  1: { fill: 'warning', text: 'warningText' },
  2: { fill: 'accent', text: 'accentText' },
  3: { fill: 'success', text: 'successText' },
};

interface Props {
  value: string;
  /** Drive from the field's focus state. */
  visible: boolean;
  /** Used to reject passwords built from the user's own name or email. */
  context?: { email?: string; name?: string };
  style?: StyleProp<ViewStyle>;
}

export function PasswordStrength({ value, visible, context, style }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();

  if (!visible) return null;

  const check = checkPassword(value, context);
  const tone = TONES[check.score];
  // Before the first keystroke there's nothing to grade — show the
  // requirement alone rather than an accusing red bar.
  const graded = value.length > 0;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(160)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
      layout={reduceMotion ? undefined : LinearTransition.duration(160)}
      style={[styles.wrap, style]}
    >
      {graded && (
        <View style={styles.barRow}>
          <View style={styles.segments}>
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.segment,
                  i <= check.score && { backgroundColor: colors[tone.fill] },
                ]}
              />
            ))}
          </View>
          {/* Fixed width so "Strong" and "Weak" don't resize the bar. */}
          <AppText variant="caption" color={tone.text} style={styles.label}>
            {check.label}
          </AppText>
        </View>
      )}

      {!!check.hint && (
        <AppText variant="caption" color="textTertiary">
          {check.hint}
        </AppText>
      )}
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: spacing.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  segments: { flex: 1, flexDirection: 'row', gap: spacing.xs },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: t.colors.sunken,
  },
  label: { minWidth: 46, textAlign: 'right' },
}));

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, shadows, spacing } from '@/theme';
import { AnimatedPressable, AppText } from '@/components/ui';

export interface NextWorkoutPreview {
  title: string;
  dayLabel: string;
  estMinutes: number;
  exerciseCount: number;
}

interface Props {
  /** Omit on past dates — hides the Next-up strip. */
  nextWorkout?: NextWorkoutPreview;
  onPressNextWorkout?: () => void;
}

/**
 * The rest-day hero — WorkoutHeroCard's calm twilight sibling. Same frame
 * (shadow wrap, radius.xl, diagonal gradient), different register: deep blues,
 * a night-sky decoration layer, recovery tips, and a peek at the next session.
 */
export function RestDayCard({ nextWorkout, onPressNextWorkout }: Props) {
  return (
    <View style={styles.shadowWrap}>
      <LinearGradient
        colors={gradients.rest}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.card}
      >
        <NightSky />

        {/* Badge */}
        <View style={styles.topRow}>
          <View style={styles.badge}>
            <Ionicons name="moon" size={14} color={colors.textInverse} />
            <AppText variant="label" color="textInverse">
              Rest day
            </AppText>
          </View>
        </View>

        <AppText variant="h1" color="textInverse" style={styles.title}>
          Grow while you rest
        </AppText>

        {/* Recovery tips band */}
        <View style={styles.tipsRow}>
          {(
            [
              ['moon', 'Sleep 8h'],
              ['water', 'Hydrate'],
              ['walk', 'Easy walk'],
            ] as const
          ).map(([icon, tip], i) => (
            <View key={tip} style={styles.tipCell}>
              {i > 0 && <View style={styles.tipDivider} />}
              <View style={styles.tipInner}>
                <Ionicons name={icon} size={24} color={colors.textInverse} />
                <AppText variant="bodyMedium" color="textInverse">
                  {tip}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        {/* Next session peek — the one bright, tappable moment on the card */}
        {nextWorkout && (
          <AnimatedPressable
            style={styles.nextCard}
            onPress={onPressNextWorkout}
            disabled={!onPressNextWorkout}
          >
            <View style={styles.nextIconWell}>
              <Ionicons name="barbell" size={17} color={colors.accentText} />
            </View>
            <View style={styles.nextTextCol}>
              <AppText variant="label" color="accentText">
                Next up · {nextWorkout.dayLabel}
              </AppText>
              <AppText variant="h3" numberOfLines={1}>
                {nextWorkout.title}
              </AppText>
              <AppText variant="caption">
                {nextWorkout.estMinutes} min · {nextWorkout.exerciseCount}{' '}
                exercises
              </AppText>
            </View>
            {onPressNextWorkout && (
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textTertiary}
              />
            )}
          </AnimatedPressable>
        )}
      </LinearGradient>
    </View>
  );
}

/**
 * Decorative night sky: crescent moon, recovery ripples, scattered stars.
 * Breathes gently unless the user prefers reduced motion.
 */
function NightSky() {
  const reduceMotion = useReducedMotion();
  const breath = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    breath.value = withRepeat(
      withTiming(1.04, { duration: 4000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [reduceMotion, breath]);

  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, breathStyle]}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%">
        {/* Ripples radiating from the moon */}
        <Circle cx="86%" cy={36} r={44} fill="none" strokeWidth={1.5} stroke="rgba(255,255,255,0.14)" />
        <Circle cx="86%" cy={36} r={72} fill="none" strokeWidth={1.5} stroke="rgba(255,255,255,0.09)" />
        <Circle cx="86%" cy={36} r={104} fill="none" strokeWidth={1.5} stroke="rgba(255,255,255,0.05)" />
        {/* Crescent moon: a bite taken out with a gradient-mid-tone circle */}
        <Circle cx="86%" cy={36} r={22} fill="rgba(255,255,255,0.18)" />
        <Circle cx="89%" cy={30} r={19} fill="#14528F" fillOpacity={0.9} />
        {/* Stars */}
        <Circle cx="8%" cy={18} r={2} fill="rgba(255,255,255,0.5)" />
        <Circle cx="18%" cy={64} r={1.5} fill="rgba(255,255,255,0.5)" />
        <Circle cx="30%" cy={30} r={2.5} fill="rgba(255,255,255,0.5)" />
        <Circle cx="55%" cy={14} r={1.5} fill="rgba(255,255,255,0.5)" />
        <Circle cx="68%" cy={52} r={2} fill="rgba(255,255,255,0.5)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: { ...shadows.md, borderRadius: radius.xl },
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  title: { marginTop: spacing.md },
  tipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
  },
  tipCell: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  tipDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  tipInner: { flex: 1, alignItems: 'center', gap: spacing.xs },
  nextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  nextIconWell: {
    width: 34,
    height: 34,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextTextCol: { flex: 1, gap: 2 },
});

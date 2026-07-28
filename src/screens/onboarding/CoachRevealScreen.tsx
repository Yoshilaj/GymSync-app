/**
 * The reveal — the one emotional beat in the flow, so it gets the full brand
 * fill instead of a card on a question screen. Hand-rolled chrome: the shared
 * OnboardingStep back pill, progress bar, and footer all assume a light
 * surface, and a `brand` variant for a single consumer is worse than 30 lines
 * of local chrome.
 *
 * Honesty rule carried over from the shipped copy: we "matched" the user with
 * a preset — never "built just for you" — and Settings can switch it.
 */
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  AppText,
  Button,
  Entering,
  ProgressBar,
  RingsMotif,
  Screen,
} from '@/components/ui';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { useOnboarding } from './OnboardingContext';
import { useStepFlow } from './useStepFlow';
import { COACH_PROFILES, matchCoach } from './coachMatch';
import type { CoachPersonality } from '@/types';

/** Identity mark per preset — a glyph, not a color: any per-coach hue on the
 * fixed brand blue either fails contrast or spends reserved accent colors. */
const COACH_GLYPHS: Record<CoachPersonality, keyof typeof Ionicons.glyphMap> = {
  classic: 'analytics-outline',
  supportive: 'heart-outline',
  energetic: 'flash-outline',
};

export function CoachRevealScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const focused = useIsFocused();
  const { draft } = useOnboarding();
  const { progress, prevProgress, goNext, goBack } = useStepFlow();

  // Pure and deterministic, so recomputing here beats threading state through
  // the interstitial that already scored it.
  const personality = matchCoach(draft.coachAnswers);
  const coach = COACH_PROFILES[personality];

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const advance = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void goNext();
  };

  return (
    <Screen
      fill="brand"
      tabBarClearance={false}
      footer={
        <View style={styles.footer}>
          <AppText
            variant="caption"
            color={colors.textInverse}
            align="center"
            style={styles.footnote}
          >
            {`Based on your answers, we matched you with ${coach.name}. You can switch anytime in Settings.`}
          </AppText>
          <Button title="Continue" variant="onBrand" onPress={advance} />
        </View>
      }
    >
      {/* Dark glyphs would be illegible on the brand fill. */}
      {focused && <StatusBar style="light" />}
      <RingsMotif color={colors.textInverse} width={320} height={220} />

      <View style={styles.top}>
        <Pressable
          onPress={goBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textInverse} />
        </Pressable>
        <View style={styles.progress}>
          <ProgressBar
            value={progress}
            animateFrom={prevProgress}
            tone="onBrand"
            animated
          />
        </View>
      </View>

      <View style={styles.hero}>
        <Entering index={0}>
          <View style={styles.glyphWell}>
            <Ionicons
              name={COACH_GLYPHS[personality]}
              size={28}
              color={colors.textInverse}
            />
          </View>
        </Entering>
        <Entering index={1}>
          <AppText
            variant="label"
            color={colors.textInverse}
            style={[styles.eyebrow, styles.dimmed]}
          >
            Your AI coach
          </AppText>
        </Entering>
        <Entering index={2}>
          <AppText variant="display" color={colors.textInverse}>
            {coach.name}
          </AppText>
        </Entering>
        <Entering index={3}>
          <AppText
            variant="h3"
            color={colors.textInverse}
            style={[styles.tagline, styles.dimmed]}
          >
            {coach.tagline}
          </AppText>
        </Entering>
        <Entering index={4}>
          <AppText
            variant="body"
            color={colors.textInverse}
            style={[styles.explainer, styles.dimmed]}
          >
            A voice coach that runs your workouts with you — guiding every
            set, tracking your reps, and adjusting the plan as you train.
          </AppText>
        </Entering>
        {/* What THIS coach is like — scannable, no prose to decode. */}
        <View style={styles.traits}>
          {coach.traits.map((trait, i) => (
            <Entering key={trait.icon} index={5 + i}>
              <View style={styles.traitRow}>
                <View style={styles.traitIcon}>
                  <Ionicons
                    name={trait.icon}
                    size={16}
                    color={colors.textInverse}
                  />
                </View>
                <AppText
                  variant="bodyMedium"
                  color={colors.textInverse}
                  style={styles.traitText}
                >
                  {trait.text}
                </AppText>
              </View>
            </Entering>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.onBrandOverlay,
  },
  progress: { flex: 1 },
  pressed: { opacity: 0.6 },
  hero: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: spacing.xxxl,
  },
  glyphWell: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.onBrandOverlay,
    marginBottom: spacing.xl,
  },
  // Text tokens are tuned for light/dark surfaces, not blue — secondary text
  // on the brand fill steps back with opacity instead (WelcomeScreen's rule).
  dimmed: { opacity: 0.82 },
  eyebrow: { marginBottom: spacing.xs },
  tagline: { marginTop: spacing.sm },
  explainer: { marginTop: spacing.lg },
  traits: { marginTop: spacing.xxl, gap: spacing.lg },
  traitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  traitIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.onBrandOverlay,
  },
  traitText: { flex: 1 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  footnote: { opacity: 0.7 },
}));

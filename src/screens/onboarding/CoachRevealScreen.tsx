import { useEffect } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText, Card } from '@/components/ui';
import { makeStyles, spacing } from '@/theme';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { COACH_PROFILES, matchCoach } from './coachMatch';

export function CoachRevealScreen() {
  const styles = useStyles();
  const { draft } = useOnboarding();

  // Pure and deterministic, so recomputing here beats threading state through
  // the interstitial that already scored it.
  const coach = COACH_PROFILES[matchCoach(draft.coachAnswers)];

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  return (
    <OnboardingStep
      title="Meet your coach."
      subtitle={`Based on your answers, we matched you with ${coach.name}.`}
      valid
      footnote="Not quite right? You can switch coaches anytime in Settings."
    >
      <View style={styles.stack}>
        <Card variant="floating">
          <AppText variant="h2">{coach.name}</AppText>
          <AppText variant="caption" color="accentText" style={styles.tagline}>
            {coach.tagline}
          </AppText>
          <AppText variant="body" style={styles.sample}>
            {coach.sample}
          </AppText>
        </Card>

        <AppText variant="body" color="textSecondary">
          {coach.behaviour}
        </AppText>
      </View>
    </OnboardingStep>
  );
}

const useStyles = makeStyles(() => ({
  stack: { gap: spacing.lg },
  tagline: { marginTop: spacing.xxs },
  sample: { marginTop: spacing.lg },
}));

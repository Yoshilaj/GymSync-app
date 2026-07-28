import { View } from 'react-native';
import { AppText, Entering, NumberWheel, WheelRow, WheelUnit } from '@/components/ui';
import { makeStyles, spacing } from '@/theme';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

export function SessionLengthScreen() {
  const { draft, patch } = useOnboarding();
  const styles = useStyles();

  const minutes = draft.sessionMinutes ?? 60;
  const days = draft.trainingDays;
  // Show the commitment they just made, in the unit people actually feel.
  const weekly = days ? (days * minutes) / 60 : null;

  return (
    <OnboardingStep
      title="How long is a session?"
      subtitle="Your coach will fit the work into the time you've got."
      valid={draft.sessionMinutes !== null}
      fill
    >
      <Entering>
        <View style={styles.center}>
          <WheelRow>
            <NumberWheel
              min={20}
              max={120}
              step={5}
              value={minutes}
              onChange={(m) => patch({ sessionMinutes: m })}
              width={96}
              showBand={false}
              accessibilityLabel="Session length in minutes"
            />
            <WheelUnit label="min" />
          </WheelRow>

          {weekly !== null && (
            <AppText variant="caption" color="textSecondary" align="center">
              {days} days × {minutes} min — about{' '}
              {weekly % 1 === 0 ? weekly : weekly.toFixed(1)} hours a week
            </AppText>
          )}
        </View>
      </Entering>
    </OnboardingStep>
  );
}

const useStyles = makeStyles(() => ({
  center: { alignItems: 'center', gap: spacing.lg },
}));

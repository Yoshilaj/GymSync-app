import { StyleSheet } from 'react-native';
import { AppText, Chip, Input } from '@/components/ui';
import { spacing } from '@/theme';
import { OnboardingStep, StepSection } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

export function InjuriesScreen() {
  const { draft, patch, submitting, submitError, submit } = useOnboarding();

  const none = draft.injuriesNote === '';
  // Always valid — injuries are the one optional step ("None" is an answer).

  return (
    <OnboardingStep
      step={6}
      title="Anything we should work around?"
      subtitle="Injuries, aches, movements to avoid — your coach plans around them."
      valid={!submitting}
      continueLabel="Save & build my plan"
      continueLoading={submitting}
      onContinue={() => void submit()}
    >
      <StepSection label="Injuries or limitations">
        <Chip
          label="None — I'm good"
          selected={none}
          onPress={() => patch({ injuriesNote: '' })}
        />
        <Input
          placeholder="e.g. right shoulder impingement — overhead pressing hurts"
          value={draft.injuriesNote}
          onChangeText={(t) => patch({ injuriesNote: t })}
          multiline
          numberOfLines={3}
        />
      </StepSection>
      {!!submitError && (
        <AppText variant="caption" color="dangerText" style={styles.error}>
          {submitError} — check your connection and try again.
        </AppText>
      )}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  error: { marginTop: -spacing.md },
});

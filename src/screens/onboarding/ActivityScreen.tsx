import { ChoiceList } from '@/components/ui';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { ACTIVITY_LEVELS } from './options';

export function ActivityScreen() {
  const { draft, patch } = useOnboarding();

  return (
    <OnboardingStep
      title="How active are you outside the gym?"
      subtitle="Your day job moves the numbers more than most people expect."
      valid={draft.activityLevel !== null}
    >
      <ChoiceList
        options={ACTIVITY_LEVELS}
        value={draft.activityLevel}
        onChange={(v) => patch({ activityLevel: v })}
      />
    </OnboardingStep>
  );
}

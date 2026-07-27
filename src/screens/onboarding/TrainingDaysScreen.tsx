import { ChoiceList } from '@/components/ui';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { TRAINING_DAYS } from './options';

export function TrainingDaysScreen() {
  const { draft, patch } = useOnboarding();

  return (
    <OnboardingStep
      title="How many days a week can you train?"
      subtitle="Be honest — a plan you can keep beats a plan you can't."
      valid={draft.trainingDays !== null}
    >
      <ChoiceList
        options={TRAINING_DAYS}
        value={draft.trainingDays}
        onChange={(v) => patch({ trainingDays: v })}
      />
    </OnboardingStep>
  );
}

import { ChoiceList } from '@/components/ui';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { GOALS } from './options';

export function GoalScreen() {
  const { draft, patch } = useOnboarding();
  // One primary goal drives the plan; the wire format stays a list.
  const goal = draft.goals[0] ?? null;

  return (
    <OnboardingStep
      title="What are you training for?"
      subtitle="Everything after this is built around your answer."
      valid={goal !== null}
    >
      <ChoiceList
        options={GOALS}
        value={goal}
        onChange={(v) => patch({ goals: [v] })}
      />
    </OnboardingStep>
  );
}

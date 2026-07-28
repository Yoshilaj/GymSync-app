import { ChoiceList } from '@/components/ui';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { GOALS } from './options';

const MAX_GOALS = 2;

export function GoalScreen() {
  const { draft, patch } = useOnboarding();
  const goals = draft.goals;

  // Toggle with a cap of two. At the cap a new tap replaces the OLDEST pick —
  // ignoring the tap would read as broken, and the newest choice is the one
  // the user just decided they want.
  const toggle = (v: string) => {
    if (goals.includes(v)) {
      patch({ goals: goals.filter((g) => g !== v) });
    } else if (goals.length < MAX_GOALS) {
      patch({ goals: [...goals, v] });
    } else {
      patch({ goals: [...goals.slice(1), v] });
    }
  };

  return (
    <OnboardingStep
      title="What's your goal?"
      subtitle="Everything is built around this. Pick up to two."
      valid={goals.length >= 1}
    >
      <ChoiceList options={GOALS} value={goals} onChange={toggle} />
    </OnboardingStep>
  );
}

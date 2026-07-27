import { ChoiceList } from '@/components/ui';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { EXPERIENCE } from './options';

export function ExperienceScreen() {
  const { draft, patch } = useOnboarding();

  return (
    <OnboardingStep
      title="How much training experience do you have?"
      subtitle="This sets how much your coach explains, and how complex the lifts get."
      valid={draft.experience !== null}
    >
      <ChoiceList
        options={EXPERIENCE}
        value={draft.experience}
        onChange={(v) => patch({ experience: v })}
      />
    </OnboardingStep>
  );
}

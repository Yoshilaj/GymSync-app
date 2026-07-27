import { ChoiceList } from '@/components/ui';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { SOURCES } from './options';

export function SourceScreen() {
  const { draft, patch } = useOnboarding();

  return (
    <OnboardingStep
      title="Where did you hear about us?"
      subtitle="Helps us know where to show up. Skip it if you'd rather not say."
      valid={draft.attribution !== null}
    >
      <ChoiceList
        options={SOURCES}
        value={draft.attribution}
        onChange={(v) => patch({ attribution: v })}
      />
    </OnboardingStep>
  );
}

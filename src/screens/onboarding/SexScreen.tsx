import { ChoiceList } from '@/components/ui';
import type { Sex } from '@/api/profile';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { SEXES } from './options';

export function SexScreen() {
  const { draft, patch } = useOnboarding();
  const value: Sex | 'skip' | null = draft.sexAnsweredSkip ? 'skip' : draft.sex;

  return (
    <OnboardingStep
      title="Which should we use for your calorie math?"
      subtitle="Energy needs differ enough that guessing would skew your targets."
      valid={draft.sex !== null || draft.sexAnsweredSkip}
      footnote="Only used for calorie and recovery math. Never shown to anyone."
    >
      <ChoiceList
        options={SEXES}
        value={value}
        onChange={(v) =>
          patch(
            v === 'skip'
              ? { sex: null, sexAnsweredSkip: true }
              : { sex: v, sexAnsweredSkip: false },
          )
        }
      />
    </OnboardingStep>
  );
}

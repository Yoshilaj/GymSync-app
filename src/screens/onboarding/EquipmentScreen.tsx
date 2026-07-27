import { ChoiceList } from '@/components/ui';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { HOME_EQUIPMENT } from './options';

/**
 * Only shown when the user trains at home — a full gym and bodyweight-only
 * both answer this question by themselves (see TrainingPlaceScreen).
 */
export function EquipmentScreen() {
  const { draft, toggleInList } = useOnboarding();

  return (
    <OnboardingStep
      title="What do you have at home?"
      subtitle="Pick everything you can get to. Your plan won't ask for anything else."
      valid={draft.equipment.length > 0}
    >
      <ChoiceList
        options={HOME_EQUIPMENT}
        value={draft.equipment}
        onChange={(v) => toggleInList('equipment', v)}
      />
    </OnboardingStep>
  );
}

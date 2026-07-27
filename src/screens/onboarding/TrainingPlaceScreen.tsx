import { ChoiceList } from '@/components/ui';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { TRAINING_PLACES, equipmentForPlace } from './options';

export function TrainingPlaceScreen() {
  const { draft, patch } = useOnboarding();

  return (
    <OnboardingStep
      title="Where will you train?"
      subtitle="Your plan only uses equipment you actually have."
      valid={draft.trainingPlace !== null}
    >
      <ChoiceList
        options={TRAINING_PLACES}
        value={draft.trainingPlace}
        // A gym or bodyweight-only answer settles the equipment question on its
        // own; "home" leaves it empty and the next step appears to fill it.
        onChange={(v) =>
          patch({ trainingPlace: v, equipment: equipmentForPlace(v) })
        }
      />
    </OnboardingStep>
  );
}

import { ChoiceGrid, Entering, Input } from '@/components/ui';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { INJURY_AREAS } from './options';

export function LimitationsScreen() {
  const { draft, patch, toggleInList } = useOnboarding();

  return (
    <OnboardingStep
      title="Anything we should work around?"
      subtitle="Your coach will pick movements that don't aggravate it."
      // Nothing to report is a valid answer — this step never blocks.
      valid
      footnote="GymSync isn't a medical service and can't diagnose anything. If a movement hurts, stop."
    >
      {/* Grid cells, not chips — same tap-target weight as the choice rows on
          every neighbouring screen. */}
      <ChoiceGrid
        options={INJURY_AREAS}
        value={draft.injuryAreas}
        onChange={(v) => toggleInList('injuryAreas', v)}
      />

      <Entering index={4}>
        <Input
          label="Anything else"
          placeholder="Old shoulder injury, avoid overhead pressing…"
          value={draft.injuriesNote}
          onChangeText={(injuriesNote) => patch({ injuriesNote })}
          multiline
        />
      </Entering>
    </OnboardingStep>
  );
}

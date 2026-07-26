import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '@/navigation/OnboardingNavigator';
import { Chip } from '@/components/ui';
import { ChipGrid, OnboardingStep, StepSection } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

// Tokens match the exercises catalog's `equipment` vocabulary, so plan
// proposals can be validated against what the user actually has.
const EQUIPMENT = [
  { value: 'Barbell', label: 'Barbell' },
  { value: 'Dumbbell', label: 'Dumbbells' },
  { value: 'Cable', label: 'Cables' },
  { value: 'Machine', label: 'Machines' },
  { value: 'Kettlebell', label: 'Kettlebells' },
  { value: 'Bodyweight', label: 'Bodyweight' },
];

const FULL_GYM = EQUIPMENT.map((e) => e.value);

export function EquipmentScreen() {
  const nav =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { draft, patch, toggleInList } = useOnboarding();

  const hasFullGym = FULL_GYM.every((e) => draft.equipment.includes(e));

  return (
    <OnboardingStep
      step={3}
      title="What can you train with?"
      subtitle="Your plan only uses equipment you actually have."
      valid={draft.equipment.length > 0}
      onContinue={() => nav.navigate('AboutYou')}
    >
      <StepSection label="Quick pick">
        <Chip
          label="Full gym — everything"
          selected={hasFullGym}
          onPress={() => patch({ equipment: hasFullGym ? [] : FULL_GYM })}
        />
      </StepSection>
      <StepSection label="Or select what you have">
        <ChipGrid
          options={EQUIPMENT}
          selected={draft.equipment}
          onToggle={(v) => toggleInList('equipment', v)}
        />
      </StepSection>
    </OnboardingStep>
  );
}

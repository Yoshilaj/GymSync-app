import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '@/navigation/OnboardingNavigator';
import type { ExperienceLevel } from '@/api/profile';
import { ChipGrid, OnboardingStep, StepSection } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

const GOALS = [
  { value: 'muscle', label: 'Build muscle' },
  { value: 'strength', label: 'Get stronger' },
  { value: 'fat_loss', label: 'Lose fat' },
  { value: 'general_fitness', label: 'General fitness' },
  { value: 'endurance', label: 'Endurance' },
];

const EXPERIENCE: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export function GoalsScreen() {
  const nav =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { draft, patch, toggleInList } = useOnboarding();

  return (
    <OnboardingStep
      step={1}
      title="What are you training for?"
      subtitle="Pick everything that applies — your plan is built around it."
      valid={draft.goals.length > 0 && draft.experience !== null}
      onContinue={() => nav.navigate('Schedule')}
    >
      <StepSection label="Goals">
        <ChipGrid
          options={GOALS}
          selected={draft.goals}
          onToggle={(v) => toggleInList('goals', v)}
        />
      </StepSection>
      <StepSection label="Experience">
        <ChipGrid
          options={EXPERIENCE}
          selected={draft.experience ? [draft.experience] : []}
          onToggle={(v) => patch({ experience: v as ExperienceLevel })}
        />
      </StepSection>
    </OnboardingStep>
  );
}

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '@/navigation/OnboardingNavigator';
import { ChipGrid, OnboardingStep, StepSection } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

const DAYS = [2, 3, 4, 5, 6].map((d) => ({
  value: String(d),
  label: `${d} days`,
}));

const LENGTHS = [30, 45, 60, 75, 90].map((m) => ({
  value: String(m),
  label: `${m} min`,
}));

export function ScheduleScreen() {
  const nav =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { draft, patch } = useOnboarding();

  return (
    <OnboardingStep
      step={2}
      title="How often can you train?"
      subtitle="Be honest — a plan you can keep beats a plan you can't."
      valid={draft.trainingDays !== null && draft.sessionMinutes !== null}
      onContinue={() => nav.navigate('Equipment')}
    >
      <StepSection label="Days per week">
        <ChipGrid
          options={DAYS}
          selected={draft.trainingDays ? [String(draft.trainingDays)] : []}
          onToggle={(v) => patch({ trainingDays: Number(v) })}
        />
      </StepSection>
      <StepSection label="Time per session">
        <ChipGrid
          options={LENGTHS}
          selected={draft.sessionMinutes ? [String(draft.sessionMinutes)] : []}
          onToggle={(v) => patch({ sessionMinutes: Number(v) })}
        />
      </StepSection>
    </OnboardingStep>
  );
}

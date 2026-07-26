import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '@/navigation/OnboardingNavigator';
import { NumberWheel, WheelRow, WheelUnit } from '@/components/ui';
import { OnboardingStep, SegmentRow, StepSection } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6].map((d) => ({
  value: d,
  label: String(d),
}));

export function ScheduleScreen() {
  const nav =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { draft, patch } = useOnboarding();

  // Seed the wheel default so the step validates without a scroll.
  useEffect(() => {
    if (draft.sessionMinutes === null) patch({ sessionMinutes: 60 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <OnboardingStep
      step={2}
      title="How often can you train?"
      subtitle="Be honest — a plan you can keep beats a plan you can't."
      valid={draft.trainingDays !== null && draft.sessionMinutes !== null}
      onContinue={() => nav.navigate('Equipment')}
    >
      <StepSection label="Days per week">
        <SegmentRow
          options={DAY_OPTIONS}
          value={draft.trainingDays}
          onChange={(d) => patch({ trainingDays: d })}
        />
      </StepSection>
      <StepSection label="Time per session">
        <WheelRow>
          <NumberWheel
            min={20}
            max={120}
            step={5}
            value={draft.sessionMinutes ?? 60}
            onChange={(m) => patch({ sessionMinutes: m })}
            width={96}
            showBand={false}
            accessibilityLabel="Session length"
          />
          <WheelUnit label="min" />
        </WheelRow>
      </StepSection>
    </OnboardingStep>
  );
}

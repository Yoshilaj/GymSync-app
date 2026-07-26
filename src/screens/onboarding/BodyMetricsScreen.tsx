import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '@/navigation/OnboardingNavigator';
import type { Units } from '@/types';
import { NumberWheel, WheelRow, WheelUnit } from '@/components/ui';
import { cmToFtIn } from '@/lib/units';
import { OnboardingStep, SegmentRow, StepSection } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

const UNIT_OPTIONS: { value: Units; label: string }[] = [
  { value: 'lbs', label: 'lbs / ft-in' },
  { value: 'kg', label: 'kg / cm' },
];

export function BodyMetricsScreen() {
  const nav =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { draft, patch, heightCmValue, weightKgValue } = useOnboarding();
  const metric = draft.units === 'kg';

  // Seed sensible defaults so the wheels land somewhere and Continue enables.
  useEffect(() => {
    const seeds: Record<string, string> = {};
    if (metric) {
      if (!draft.heightCm) seeds.heightCm = '175';
      if (!draft.weight) seeds.weight = '75.0';
    } else {
      if (!draft.heightFeet) {
        seeds.heightFeet = '5';
        seeds.heightInches = '10';
      }
      if (!draft.weight) seeds.weight = '165.0';
    }
    if (Object.keys(seeds).length) patch(seeds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric]);

  const switchUnits = (u: Units) => {
    if (u === draft.units) return;
    // Convert the current values so the wheels don't jump to strangers.
    const patchNext: Record<string, string> = {};
    if (u === 'kg') {
      const cm = heightCmValue ?? 175;
      patchNext.heightCm = String(cm);
      const kg = weightKgValue ?? 75;
      patchNext.weight = (Math.round(kg * 10) / 10).toFixed(1);
    } else {
      const { feet, inches } = cmToFtIn(heightCmValue ?? 175);
      patchNext.heightFeet = String(feet);
      patchNext.heightInches = String(inches);
      const lbs = (weightKgValue ?? 75) / 0.45359237;
      patchNext.weight = (Math.round(lbs * 10) / 10).toFixed(1);
    }
    patch({ units: u, ...patchNext });
  };

  const weightNum = Number(draft.weight) || (metric ? 75 : 165);
  const weightInt = Math.floor(weightNum);
  const weightDec = Math.round((weightNum % 1) * 10);

  const setWeight = (int: number, dec: number) =>
    patch({ weight: `${int}.${dec}` });

  return (
    <OnboardingStep
      step={5}
      title="Body stats"
      subtitle="Sets your starting calorie and load math — you can update these anytime."
      valid={heightCmValue !== null && weightKgValue !== null}
      onContinue={() => nav.navigate('Injuries')}
    >
      <StepSection label="Units">
        <SegmentRow options={UNIT_OPTIONS} value={draft.units} onChange={switchUnits} />
      </StepSection>

      <StepSection label="Height">
        {metric ? (
          <WheelRow>
            <NumberWheel
              min={120}
              max={220}
              value={Number(draft.heightCm) || 175}
              onChange={(cm) => patch({ heightCm: String(cm) })}
              width={88}
              showBand={false}
              accessibilityLabel="Height"
            />
            <WheelUnit label="cm" />
          </WheelRow>
        ) : (
          <WheelRow>
            <NumberWheel
              min={3}
              max={7}
              value={Number(draft.heightFeet) || 5}
              onChange={(ft) => {
                patch({ heightFeet: String(ft) });
              }}
              width={64}
              showBand={false}
              accessibilityLabel="Height feet"
            />
            <WheelUnit label="ft" />
            <NumberWheel
              min={0}
              max={11}
              value={Number(draft.heightInches) || 0}
              onChange={(inch) => patch({ heightInches: String(inch) })}
              width={64}
              showBand={false}
              accessibilityLabel="Height inches"
            />
            <WheelUnit label="in" />
          </WheelRow>
        )}
      </StepSection>

      <StepSection label="Weight">
        <WheelRow>
          <NumberWheel
            min={metric ? 30 : 66}
            max={metric ? 250 : 550}
            value={weightInt}
            onChange={(n) => setWeight(n, weightDec)}
            width={88}
            showBand={false}
            accessibilityLabel="Weight"
          />
          <NumberWheel
            min={0}
            max={9}
            value={weightDec}
            onChange={(n) => setWeight(weightInt, n)}
            format={(n) => `.${n}`}
            width={56}
            showBand={false}
            accessibilityLabel="Weight decimal"
          />
          <WheelUnit label={draft.units} />
        </WheelRow>
      </StepSection>
    </OnboardingStep>
  );
}

import type { Units } from '@/types';
import { NumberWheel, WheelRow, WheelUnit } from '@/components/ui';
import { cmToFtIn } from '@/lib/units';
import { FieldLabel, OnboardingStep, SegmentRow } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

const UNIT_OPTIONS: { value: Units; label: string }[] = [
  { value: 'lbs', label: 'lbs / ft-in' },
  { value: 'kg', label: 'kg / cm' },
];

export function BodyScreen() {
  const { draft, patch, heightCmValue, weightKgValue } = useOnboarding();
  const metric = draft.units === 'kg';

  /** Convert in place so switching units doesn't send the wheels to strangers. */
  const switchUnits = (u: Units) => {
    if (u === draft.units) return;
    if (u === 'kg') {
      const kg = weightKgValue ?? 75;
      patch({
        units: u,
        heightCm: String(Math.round(heightCmValue ?? 175)),
        weight: String(Math.round(kg)),
      });
    } else {
      const { feet, inches } = cmToFtIn(heightCmValue ?? 175);
      const lbs = (weightKgValue ?? 75) / 0.45359237;
      patch({
        units: u,
        heightFeet: String(feet),
        heightInches: String(inches),
        weight: String(Math.round(lbs)),
      });
    }
  };

  const weightValue = Math.round(Number(draft.weight)) || (metric ? 75 : 165);

  return (
    <OnboardingStep
      title="Your height and weight"
      subtitle="Sets your starting calorie and load math. You can change these anytime."
      valid={heightCmValue !== null && weightKgValue !== null}
    >
      <SegmentRow options={UNIT_OPTIONS} value={draft.units} onChange={switchUnits} />

      <FieldLabel label="Height">
        {metric ? (
          <WheelRow>
            <NumberWheel
              min={120}
              max={220}
              value={Number(draft.heightCm) || 175}
              onChange={(cm) => patch({ heightCm: String(cm) })}
              width={88}
              showBand={false}
              accessibilityLabel="Height in centimetres"
            />
            <WheelUnit label="cm" />
          </WheelRow>
        ) : (
          <WheelRow>
            <NumberWheel
              min={3}
              max={7}
              value={Number(draft.heightFeet) || 5}
              onChange={(ft) => patch({ heightFeet: String(ft) })}
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
      </FieldLabel>

      <FieldLabel label="Weight">
        <WheelRow>
          <NumberWheel
            min={metric ? 30 : 66}
            max={metric ? 250 : 550}
            value={weightValue}
            onChange={(n) => patch({ weight: String(n) })}
            width={96}
            showBand={false}
            accessibilityLabel="Weight"
          />
          <WheelUnit label={draft.units} />
        </WheelRow>
      </FieldLabel>
    </OnboardingStep>
  );
}

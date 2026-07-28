/**
 * Height and weight as tape measures: a big readout, a ruler underneath.
 * (Tonal's Personal Info screen is the reference — readout + ruler reads as
 * an instrument, where two number wheels read as a form.)
 */
import { View } from 'react-native';
import type { Units } from '@/types';
import { AppText, RulerPicker } from '@/components/ui';
import { makeStyles, spacing } from '@/theme';
import { cmToFtIn } from '@/lib/units';
import { OnboardingStep, SegmentRow } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

const UNIT_OPTIONS: { value: Units; label: string }[] = [
  { value: 'lbs', label: 'lbs / ft-in' },
  { value: 'kg', label: 'kg / cm' },
];

/** 66 → 5'6" — the ruler's major-tick labels and the height readout. */
const formatFtIn = (totalInches: number) =>
  `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;

export function BodyScreen() {
  const { draft, patch, heightCmValue, weightKgValue } = useOnboarding();
  const styles = useStyles();
  const metric = draft.units === 'kg';

  /** Convert in place so switching units doesn't send the rulers to strangers. */
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

  const heightInches =
    (Number(draft.heightFeet) || 5) * 12 + (Number(draft.heightInches) || 0);
  const heightCm = Number(draft.heightCm) || 175;
  const weight = Math.round(Number(draft.weight)) || (metric ? 75 : 165);

  return (
    <OnboardingStep
      title="Your height and weight"
      subtitle="Sets your starting calorie and load math. You can change these anytime."
      valid={heightCmValue !== null && weightKgValue !== null}
      fill
    >
      <SegmentRow options={UNIT_OPTIONS} value={draft.units} onChange={switchUnits} />

      <View style={styles.section}>
        <AppText variant="label">Height</AppText>
        <View style={styles.readout}>
          <AppText variant="statLg">
            {metric ? String(heightCm) : formatFtIn(heightInches)}
          </AppText>
          {metric && (
            <AppText variant="h3" color="textSecondary" style={styles.unit}>
              cm
            </AppText>
          )}
        </View>
        {metric ? (
          <RulerPicker
            min={120}
            max={220}
            value={heightCm}
            onChange={(cm) => patch({ heightCm: String(cm) })}
            majorEvery={10}
            accessibilityLabel="Height in centimetres"
          />
        ) : (
          <RulerPicker
            min={54}
            max={84}
            value={heightInches}
            onChange={(t) =>
              patch({
                heightFeet: String(Math.floor(t / 12)),
                heightInches: String(t % 12),
              })
            }
            majorEvery={6}
            formatLabel={formatFtIn}
            accessibilityLabel="Height in feet and inches"
          />
        )}
      </View>

      <View style={styles.section}>
        <AppText variant="label">Weight</AppText>
        <View style={styles.readout}>
          <AppText variant="statLg">{String(weight)}</AppText>
          <AppText variant="h3" color="textSecondary" style={styles.unit}>
            {draft.units}
          </AppText>
        </View>
        <RulerPicker
          min={metric ? 35 : 80}
          max={metric ? 180 : 400}
          value={weight}
          onChange={(n) => patch({ weight: String(n) })}
          majorEvery={metric ? 10 : 20}
          accessibilityLabel="Weight"
        />
      </View>
    </OnboardingStep>
  );
}

const useStyles = makeStyles(() => ({
  section: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  unit: { marginBottom: 2 },
}));

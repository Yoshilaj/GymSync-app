import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '@/navigation/OnboardingNavigator';
import { spacing } from '@/theme';
import { Input } from '@/components/ui';
import { ChipGrid, OnboardingStep, StepSection } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

const UNIT_OPTIONS = [
  { value: 'lbs', label: 'lbs / ft-in' },
  { value: 'kg', label: 'kg / cm' },
];

export function BodyMetricsScreen() {
  const nav =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { draft, patch, heightCmValue, weightKgValue } = useOnboarding();

  return (
    <OnboardingStep
      step={5}
      title="Body stats"
      subtitle="Sets your starting calorie and load math — you can update these anytime."
      valid={heightCmValue !== null && weightKgValue !== null}
      onContinue={() => nav.navigate('Injuries')}
    >
      <StepSection label="Units">
        <ChipGrid
          options={UNIT_OPTIONS}
          selected={[draft.units]}
          onToggle={(v) => patch({ units: v as 'lbs' | 'kg' })}
        />
      </StepSection>

      <StepSection label="Height">
        {draft.units === 'kg' ? (
          <Input
            keyboardType="number-pad"
            placeholder="e.g. 175 cm"
            value={draft.heightCm}
            onChangeText={(t) => patch({ heightCm: t })}
            maxLength={3}
          />
        ) : (
          <View style={styles.row}>
            <Input
              keyboardType="number-pad"
              placeholder="ft"
              value={draft.heightFeet}
              onChangeText={(t) => patch({ heightFeet: t })}
              maxLength={1}
              containerStyle={styles.rowField}
            />
            <Input
              keyboardType="number-pad"
              placeholder="in"
              value={draft.heightInches}
              onChangeText={(t) => patch({ heightInches: t })}
              maxLength={2}
              containerStyle={styles.rowField}
            />
          </View>
        )}
      </StepSection>

      <StepSection label={`Weight (${draft.units})`}>
        <Input
          keyboardType="decimal-pad"
          placeholder={draft.units === 'kg' ? 'e.g. 78' : 'e.g. 172'}
          value={draft.weight}
          onChangeText={(t) => patch({ weight: t })}
          maxLength={5}
        />
      </StepSection>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowField: { flex: 1 },
});

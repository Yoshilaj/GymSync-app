import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '@/navigation/OnboardingNavigator';
import type { ActivityLevel, Sex } from '@/api/profile';
import { Input } from '@/components/ui';
import { ChipGrid, OnboardingStep, StepSection } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'skip', label: 'Prefer not to say' },
];

const ACTIVITY: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Mostly sitting' },
  { value: 'light', label: 'Lightly active' },
  { value: 'moderate', label: 'Moderately active' },
  { value: 'very_active', label: 'Very active' },
  { value: 'athlete', label: 'Athlete' },
];

const THIS_YEAR = new Date().getFullYear();

export function AboutYouScreen() {
  const nav =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList>>();
  const { draft, patch } = useOnboarding();

  const birthYearValid =
    draft.birthYear !== null &&
    draft.birthYear >= 1900 &&
    draft.birthYear <= THIS_YEAR - 10;

  // sex is genuinely optional ("prefer not to say" = null) — track whether
  // the user made *a* choice so the step still requires an answer.
  const sexAnswered = draft.sex !== null || draft.sexAnsweredSkip === true;

  return (
    <OnboardingStep
      step={4}
      title="A little about you"
      subtitle="Used for calorie and recovery math — never shown to anyone."
      valid={sexAnswered && birthYearValid && draft.activityLevel !== null}
      onContinue={() => nav.navigate('BodyMetrics')}
    >
      <StepSection label="Sex">
        <ChipGrid
          options={SEX_OPTIONS}
          selected={
            draft.sex ? [draft.sex] : draft.sexAnsweredSkip ? ['skip'] : []
          }
          onToggle={(v) =>
            v === 'skip'
              ? patch({ sex: null, sexAnsweredSkip: true })
              : patch({ sex: v as Sex, sexAnsweredSkip: false })
          }
        />
      </StepSection>
      <StepSection label="Birth year">
        <Input
          keyboardType="number-pad"
          placeholder={`e.g. ${THIS_YEAR - 25}`}
          value={draft.birthYear ? String(draft.birthYear) : ''}
          onChangeText={(t) => {
            const n = Number(t);
            patch({ birthYear: t.length === 4 && Number.isFinite(n) ? n : null });
          }}
          maxLength={4}
        />
      </StepSection>
      <StepSection label="Day-to-day activity (outside the gym)">
        <ChipGrid
          options={ACTIVITY}
          selected={draft.activityLevel ? [draft.activityLevel] : []}
          onToggle={(v) => patch({ activityLevel: v as ActivityLevel })}
        />
      </StepSection>
    </OnboardingStep>
  );
}

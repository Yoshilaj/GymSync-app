import { View } from 'react-native';
import { AppText, Entering, NumberWheel, WheelRow } from '@/components/ui';
import { makeStyles, spacing } from '@/theme';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1930;
const MAX_YEAR = CURRENT_YEAR - 13;

export function AgeScreen() {
  const { draft, patch } = useOnboarding();
  const styles = useStyles();

  const year = draft.birthYear ?? CURRENT_YEAR - 27;
  const age = CURRENT_YEAR - year;
  const valid =
    draft.birthYear !== null &&
    draft.birthYear >= MIN_YEAR &&
    draft.birthYear <= MAX_YEAR;

  return (
    <OnboardingStep
      title="What year were you born?"
      subtitle="Recovery and calorie needs shift with age — this keeps the math honest."
      valid={valid}
      fill
    >
      <Entering>
        <View style={styles.center}>
          <WheelRow>
            <NumberWheel
              min={MIN_YEAR}
              max={MAX_YEAR}
              value={year}
              onChange={(y) => patch({ birthYear: y })}
              width={120}
              showBand={false}
              accessibilityLabel="Birth year"
            />
          </WheelRow>
          <AppText variant="caption" color="textSecondary">
            {age} years old
          </AppText>
        </View>
      </Entering>
    </OnboardingStep>
  );
}

const useStyles = makeStyles(() => ({
  center: { alignItems: 'center', gap: spacing.lg },
}));

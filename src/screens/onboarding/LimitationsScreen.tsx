import { View } from 'react-native';
import { Chip, Input } from '@/components/ui';
import { makeStyles, spacing } from '@/theme';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { INJURY_AREAS } from './options';

export function LimitationsScreen() {
  const { draft, patch, toggleInList } = useOnboarding();
  const styles = useStyles();

  return (
    <OnboardingStep
      title="Anything we should work around?"
      subtitle="Your coach will pick movements that don't aggravate it."
      // Nothing to report is a valid answer — this step never blocks.
      valid
      footnote="GymSync isn't a medical service and can't diagnose anything. If a movement hurts, stop."
    >
      <View style={styles.chips}>
        {INJURY_AREAS.map((area) => (
          <Chip
            key={area.value}
            label={area.label}
            selected={draft.injuryAreas.includes(area.value)}
            onPress={() => toggleInList('injuryAreas', area.value)}
          />
        ))}
      </View>

      <Input
        label="Anything else"
        placeholder="Old shoulder injury, avoid overhead pressing…"
        value={draft.injuriesNote}
        onChangeText={(injuriesNote) => patch({ injuriesNote })}
        multiline
      />
    </OnboardingStep>
  );
}

const useStyles = makeStyles(() => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
}));

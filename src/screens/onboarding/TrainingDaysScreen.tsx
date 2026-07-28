/**
 * Day count as an instrument, not a list. Seven identical 68pt rows made this
 * the tallest screen in the flow; a readout over seven round pills says the
 * same thing in one glance, and the selected option's description does the
 * persuading underneath.
 */
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AnimatedPressable, AppText, Entering } from '@/components/ui';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';
import { TRAINING_DAYS } from './options';

export function TrainingDaysScreen() {
  const { draft, patch } = useOnboarding();
  const { colors } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();

  const value = draft.trainingDays;
  const chosen = TRAINING_DAYS.find((o) => o.value === value);

  return (
    <OnboardingStep
      title="How many days a week can you train?"
      subtitle="Be honest — a plan you can keep beats a plan you can't."
      valid={value !== null}
      fill
    >
      <View style={styles.instrument}>
        <Entering>
          <View style={styles.readout}>
            {value === null ? (
              <AppText variant="statLg" color="textTertiary">
                —
              </AppText>
            ) : (
              <AppText variant="statLg">{value}</AppText>
            )}
            <AppText variant="h3" color="textSecondary" style={styles.unit}>
              {value === 1 ? 'day a week' : 'days a week'}
            </AppText>
          </View>
        </Entering>

        {/* One Entering around the row: a wrapper per pill would become the
            flex child and break the equal-width distribution. */}
        <Entering index={1}>
          <View style={styles.pills}>
            {TRAINING_DAYS.map((opt) => {
              const selected = opt.value === value;
              return (
                <AnimatedPressable
                  key={opt.value}
                  onPress={() => {
                    if (!selected) {
                      void Haptics.selectionAsync();
                      patch({ trainingDays: opt.value });
                    }
                  }}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${opt.label}. ${opt.description ?? ''}`}
                  style={[styles.pill, selected && styles.pillSelected]}
                >
                  <AppText
                    variant="bodyMedium"
                    color={selected ? colors.textInverse : colors.textPrimary}
                  >
                    {opt.value}
                  </AppText>
                </AnimatedPressable>
              );
            })}
          </View>
        </Entering>

        {/* Reserved two body lines so picking a day never reflows the screen. */}
        <View style={styles.captionBox}>
          {chosen?.description ? (
            <Animated.View
              key={chosen.value}
              entering={reduceMotion ? undefined : FadeIn.duration(200)}
            >
              <AppText variant="body" color="textSecondary" align="center">
                {chosen.description}
              </AppText>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </OnboardingStep>
  );
}

const useStyles = makeStyles((t) => ({
  // Children stretch (the Entering wrappers own the row width); each block
  // centers its own content.
  instrument: { gap: spacing.xl },
  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  unit: { marginBottom: 2 },
  pills: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  pill: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.bgSubtle,
    ...(t.scheme === 'dark'
      ? { borderWidth: 1, borderColor: t.colors.border }
      : null),
  },
  pillSelected: {
    backgroundColor: t.colors.accent,
    borderColor: t.colors.accent,
    ...t.shadows.sm,
  },
  captionBox: {
    minHeight: 48,
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
}));

/**
 * The pre-signup plan reveal: the actual generated plan, shown before any
 * account exists. Continue leads to SignUp — "Save your plan" stops being a
 * promise and becomes a description. Back returns to the last question
 * (Preparing replaced itself), Regenerate re-runs the build.
 *
 * The plan itself arrives via route params from PreparingScreen; it's already
 * in the stash, so a crash here still resumes with this exact plan.
 */
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PlanProposalWire } from '@/voice/protocol';
import type { ProposalStatus } from '@/voice/useTextChat';
import { PlanCard } from '@/screens/sync/components/PlanCard';
import { AppText, Entering, Screen } from '@/components/ui';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { useOnboarding } from './OnboardingContext';

type Nav = NativeStackNavigationProp<Record<string, object | undefined>>;
type PlanPreviewRoute = RouteProp<{ PlanPreview: { plan: PlanProposalWire } }, 'PlanPreview'>;

export function PlanPreviewScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<PlanPreviewRoute>();
  const { colors } = useTheme();
  const styles = useStyles();
  const { preview } = useOnboarding();
  const [status, setStatus] = useState<ProposalStatus>('pending');

  const plan = params.plan;

  // The payoff beat of the pre-auth flow.
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const handleContinue = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (preview) {
      // Dev replay has no auth stack to hand off to.
      setStatus('accepted');
      return;
    }
    nav.navigate('SignUp');
  };

  return (
    <Screen scroll wash tabBarClearance={false}>
      <View style={styles.top}>
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* One headline, one line of support — the card carries the details,
          so the header doesn't repeat them. */}
      <View style={styles.header}>
        <AppText variant="display">Your first plan is ready.</AppText>
        <AppText variant="body" color="textSecondary">
          Built from your answers — continue to save it to your account.
        </AppText>
      </View>

      <Entering>
        <PlanCard
          plan={plan}
          status={status}
          onAccept={handleContinue}
          onRequestChanges={() => nav.replace('Preparing')}
          onViewPlan={() => undefined}
          acceptLabel="Continue"
          secondaryLabel="Regenerate"
          initialOpenDay={null}
        />
      </Entering>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  // Same quiet chrome pill as OnboardingStep/Intro — content gets the card
  // treatment on the wash, chrome stays bgSubtle.
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.bgSubtle,
  },
  pressed: { opacity: 0.6 },
  header: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
}));

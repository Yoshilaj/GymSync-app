/**
 * Last question before the account ask, so it can't read as an afterthought —
 * a centered icon well and a round field give the one input a composed moment
 * (the auth success-state recipe) without inventing any new features.
 */
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Entering, Input } from '@/components/ui';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

export function ReferralScreen() {
  const { draft, patch } = useOnboarding();
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <OnboardingStep
      title="Have a referral code?"
      subtitle="If someone sent you here, this is where their code goes."
      valid
      fill
    >
      <Entering>
        <View style={styles.block}>
          <View style={styles.well}>
            <Ionicons name="gift-outline" size={28} color={colors.accentText} />
          </View>
          <Input
            round
            icon="ticket-outline"
            placeholder="Referral code (optional)"
            value={draft.referralCode}
            onChangeText={(referralCode) => patch({ referralCode })}
            autoCapitalize="characters"
            autoCorrect={false}
            containerStyle={styles.input}
          />
        </View>
      </Entering>
    </OnboardingStep>
  );
}

const useStyles = makeStyles((t) => ({
  block: { alignItems: 'center', gap: spacing.xl },
  well: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.accentFaint,
  },
  input: { alignSelf: 'stretch' },
}));

import { Input } from '@/components/ui';
import { OnboardingStep } from './OnboardingStep';
import { useOnboarding } from './OnboardingContext';

export function ReferralScreen() {
  const { draft, patch } = useOnboarding();

  return (
    <OnboardingStep
      title="Have a referral code?"
      subtitle="If someone sent you here, this is where their code goes."
      valid
    >
      <Input
        label="Referral code"
        placeholder="Optional"
        value={draft.referralCode}
        onChangeText={(referralCode) => patch({ referralCode })}
        autoCapitalize="characters"
        autoCorrect={false}
      />
    </OnboardingStep>
  );
}

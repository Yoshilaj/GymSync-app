/**
 * Settings — a nested native-stack mounted at the Progress stack's `Settings`
 * route. A hub screen pushes into focused sub-pages; every screen draws its own
 * detail header (headerShown:false), so nesting is transparent.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '@/theme';
import { SettingsHomeScreen } from '@/screens/settings/SettingsHomeScreen';
import { ProfileEditScreen } from '@/screens/settings/ProfileEditScreen';
import { AccountSettingsScreen } from '@/screens/settings/AccountSettingsScreen';
import { ChangeEmailScreen } from '@/screens/settings/ChangeEmailScreen';
import { ChangePasswordScreen } from '@/screens/settings/ChangePasswordScreen';
import { TwoFactorScreen } from '@/screens/settings/TwoFactorScreen';
import { PricingSettingsRoute } from '@/screens/pricing';
import type { PricingContext, PaidTierId } from '@/screens/pricing';
import { NotificationsSettingsScreen } from '@/screens/settings/NotificationsSettingsScreen';
import { WorkoutSettingsScreen } from '@/screens/settings/WorkoutSettingsScreen';
import { LanguageSettingsScreen } from '@/screens/settings/LanguageSettingsScreen';
import { UnitsSettingsScreen } from '@/screens/settings/UnitsSettingsScreen';
import { ThemeSettingsScreen } from '@/screens/settings/ThemeSettingsScreen';
import { InquiryScreen } from '@/screens/settings/InquiryScreen';
import { FaqScreen } from '@/screens/settings/FaqScreen';
import { AboutUsScreen } from '@/screens/settings/AboutUsScreen';
import { LegalScreen } from '@/screens/settings/LegalScreen';
import { OnboardingPreviewScreen } from '@/screens/settings/OnboardingPreviewScreen';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Profile: undefined;
  AccountSettings: undefined;
  ChangeEmail: undefined;
  ChangePassword: undefined;
  TwoFactor: undefined;
  // No `DeleteAccount` route: deleting is confirmed by a dialog over Account
  // settings (DeleteAccountDialog), not by a page you navigate to.
  // Named `Pricing`, not `Plan*`: in this codebase "plan" means the workout
  // plan (PlanStack, PlanContext, api/plan.ts), and reusing it here reads wrong.
  Pricing: { context?: PricingContext; highlight?: PaidTierId } | undefined;
  Notifications: undefined;
  WorkoutSettings: undefined;
  Language: undefined;
  Units: undefined;
  Theme: undefined;
  Inquiry: undefined;
  Faq: undefined;
  AboutUs: undefined;
  /** `fromModal` when pushed over the paywall — no tab bar to clear. */
  Legal: { kind: 'privacy' | 'terms'; fromModal?: boolean };
  /** Dev-only: walks the real onboarding flow without touching the profile. */
  OnboardingPreview: undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="SettingsHome" component={SettingsHomeScreen} />
      <Stack.Screen name="Profile" component={ProfileEditScreen} />
      <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} />
      <Stack.Screen name="ChangeEmail" component={ChangeEmailScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="TwoFactor" component={TwoFactorScreen} />
      {/* The paywall is a decision, not a settings sub-page: presented full
          screen so the floating tab bar can't compete with the CTA. */}
      <Stack.Screen
        name="Pricing"
        component={PricingSettingsRoute}
        options={{ presentation: 'fullScreenModal' }}
      />
      <Stack.Screen name="Notifications" component={NotificationsSettingsScreen} />
      <Stack.Screen name="WorkoutSettings" component={WorkoutSettingsScreen} />
      <Stack.Screen name="Language" component={LanguageSettingsScreen} />
      <Stack.Screen name="Units" component={UnitsSettingsScreen} />
      <Stack.Screen name="Theme" component={ThemeSettingsScreen} />
      <Stack.Screen name="Inquiry" component={InquiryScreen} />
      <Stack.Screen name="Faq" component={FaqScreen} />
      <Stack.Screen name="AboutUs" component={AboutUsScreen} />
      {/* From the paywall (a fullScreenModal), a plain push lands in the nav
          controller *behind* the presented modal — the page mounts invisibly
          and the tap looks dead. Presenting it modally joins the presented
          chain instead, a sheet over the paywall. About Us keeps the push. */}
      <Stack.Screen
        name="Legal"
        component={LegalScreen}
        options={({ route }) => (route.params.fromModal ? { presentation: 'modal' } : {})}
      />
      {__DEV__ && (
        <Stack.Screen
          name="OnboardingPreview"
          component={OnboardingPreviewScreen}
          options={{ presentation: 'fullScreenModal' }}
        />
      )}
    </Stack.Navigator>
  );
}

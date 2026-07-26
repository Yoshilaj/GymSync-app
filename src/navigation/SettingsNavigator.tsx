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
import { DeleteAccountScreen } from '@/screens/settings/DeleteAccountScreen';
import { PlanSettingsScreen } from '@/screens/settings/PlanSettingsScreen';
import { NotificationsSettingsScreen } from '@/screens/settings/NotificationsSettingsScreen';
import { WorkoutSettingsScreen } from '@/screens/settings/WorkoutSettingsScreen';
import { LanguageSettingsScreen } from '@/screens/settings/LanguageSettingsScreen';
import { UnitsSettingsScreen } from '@/screens/settings/UnitsSettingsScreen';
import { ThemeSettingsScreen } from '@/screens/settings/ThemeSettingsScreen';
import { InquiryScreen } from '@/screens/settings/InquiryScreen';
import { FaqScreen } from '@/screens/settings/FaqScreen';
import { AboutUsScreen } from '@/screens/settings/AboutUsScreen';
import { LegalScreen } from '@/screens/settings/LegalScreen';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Profile: undefined;
  AccountSettings: undefined;
  ChangeEmail: undefined;
  ChangePassword: undefined;
  DeleteAccount: undefined;
  PlanSettings: undefined;
  Notifications: undefined;
  WorkoutSettings: undefined;
  Language: undefined;
  Units: undefined;
  Theme: undefined;
  Inquiry: undefined;
  Faq: undefined;
  AboutUs: undefined;
  Legal: { kind: 'privacy' | 'terms' };
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
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
      <Stack.Screen name="PlanSettings" component={PlanSettingsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsSettingsScreen} />
      <Stack.Screen name="WorkoutSettings" component={WorkoutSettingsScreen} />
      <Stack.Screen name="Language" component={LanguageSettingsScreen} />
      <Stack.Screen name="Units" component={UnitsSettingsScreen} />
      <Stack.Screen name="Theme" component={ThemeSettingsScreen} />
      <Stack.Screen name="Inquiry" component={InquiryScreen} />
      <Stack.Screen name="Faq" component={FaqScreen} />
      <Stack.Screen name="AboutUs" component={AboutUsScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
    </Stack.Navigator>
  );
}

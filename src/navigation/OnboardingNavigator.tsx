/**
 * First-run onboarding — mounted by RootGate when the session exists but the
 * profile has no onboarded_at. The final step PUTs the profile (stamping
 * onboarded_at), which flips the gate into the app; a plan-kickoff flag makes
 * RootNavigator open on Sync to build the first plan.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingProvider } from '@/screens/onboarding/OnboardingContext';
import { GoalsScreen } from '@/screens/onboarding/GoalsScreen';
import { ScheduleScreen } from '@/screens/onboarding/ScheduleScreen';
import { EquipmentScreen } from '@/screens/onboarding/EquipmentScreen';
import { AboutYouScreen } from '@/screens/onboarding/AboutYouScreen';
import { BodyMetricsScreen } from '@/screens/onboarding/BodyMetricsScreen';
import { InjuriesScreen } from '@/screens/onboarding/InjuriesScreen';

export type OnboardingStackParamList = {
  Goals: undefined;
  Schedule: undefined;
  Equipment: undefined;
  AboutYou: undefined;
  BodyMetrics: undefined;
  Injuries: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingNavigator() {
  return (
    <OnboardingProvider>
      <Stack.Navigator
        initialRouteName="Goals"
        screenOptions={{ headerShown: false, gestureEnabled: true }}
      >
        <Stack.Screen name="Goals" component={GoalsScreen} />
        <Stack.Screen name="Schedule" component={ScheduleScreen} />
        <Stack.Screen name="Equipment" component={EquipmentScreen} />
        <Stack.Screen name="AboutYou" component={AboutYouScreen} />
        <Stack.Screen name="BodyMetrics" component={BodyMetricsScreen} />
        <Stack.Screen name="Injuries" component={InjuriesScreen} />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}

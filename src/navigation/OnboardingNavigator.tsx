/**
 * First-run onboarding — mounted by RootGate when the session exists but the
 * profile has no onboarded_at. The Injuries step saves the profile (without
 * completing), then BuildingPlan generates and accepts the first plan in
 * place; completeOnboarding() stamps onboarded_at and flips the gate.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingProvider } from '@/screens/onboarding/OnboardingContext';
import { GoalsScreen } from '@/screens/onboarding/GoalsScreen';
import { ScheduleScreen } from '@/screens/onboarding/ScheduleScreen';
import { EquipmentScreen } from '@/screens/onboarding/EquipmentScreen';
import { AboutYouScreen } from '@/screens/onboarding/AboutYouScreen';
import { BodyMetricsScreen } from '@/screens/onboarding/BodyMetricsScreen';
import { InjuriesScreen } from '@/screens/onboarding/InjuriesScreen';
import { BuildingPlanScreen } from '@/screens/onboarding/BuildingPlanScreen';

export type OnboardingStackParamList = {
  Goals: undefined;
  Schedule: undefined;
  Equipment: undefined;
  AboutYou: undefined;
  BodyMetrics: undefined;
  Injuries: undefined;
  BuildingPlan: undefined;
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
        <Stack.Screen
          name="BuildingPlan"
          component={BuildingPlanScreen}
          options={{ gestureEnabled: false }}
        />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}

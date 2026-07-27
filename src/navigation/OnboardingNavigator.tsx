/**
 * First-run onboarding — mounted by RootGate when the session exists but the
 * profile has no onboarded_at. The last question saves the profile (without
 * completing), then BuildingPlan generates and accepts the first plan in
 * place; completeOnboarding() stamps onboarded_at and flips the gate.
 *
 * The running order lives in `screens/onboarding/steps.ts`. This file only
 * maps step keys to components — that split is what keeps the registry free of
 * component imports, so screens can read it without a require cycle.
 */
import type { ComponentType } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingProvider } from '@/screens/onboarding/OnboardingContext';
import { ONBOARDING_STEPS, BUILDING_ROUTE } from '@/screens/onboarding/steps';
import { GoalScreen } from '@/screens/onboarding/GoalScreen';
import { ExperienceScreen } from '@/screens/onboarding/ExperienceScreen';
import { SourceScreen } from '@/screens/onboarding/SourceScreen';
import { TrainingDaysScreen } from '@/screens/onboarding/TrainingDaysScreen';
import { SessionLengthScreen } from '@/screens/onboarding/SessionLengthScreen';
import { TrainingPlaceScreen } from '@/screens/onboarding/TrainingPlaceScreen';
import { EquipmentScreen } from '@/screens/onboarding/EquipmentScreen';
import { CoachQuizScreen } from '@/screens/onboarding/CoachQuizScreen';
import { CoachMatchingScreen } from '@/screens/onboarding/CoachMatchingScreen';
import { CoachRevealScreen } from '@/screens/onboarding/CoachRevealScreen';
import { SexScreen } from '@/screens/onboarding/SexScreen';
import { AgeScreen } from '@/screens/onboarding/AgeScreen';
import { BodyScreen } from '@/screens/onboarding/BodyScreen';
import { ActivityScreen } from '@/screens/onboarding/ActivityScreen';
import { LimitationsScreen } from '@/screens/onboarding/LimitationsScreen';
import { ReferralScreen } from '@/screens/onboarding/ReferralScreen';
import { BuildingPlanScreen } from '@/screens/onboarding/BuildingPlanScreen';

const SCREENS: Record<string, ComponentType> = {
  Goal: GoalScreen,
  Experience: ExperienceScreen,
  Source: SourceScreen,
  TrainingDays: TrainingDaysScreen,
  SessionLength: SessionLengthScreen,
  TrainingPlace: TrainingPlaceScreen,
  Equipment: EquipmentScreen,
  CoachQ1: CoachQuizScreen,
  CoachQ2: CoachQuizScreen,
  CoachQ3: CoachQuizScreen,
  CoachQ4: CoachQuizScreen,
  CoachMatching: CoachMatchingScreen,
  CoachReveal: CoachRevealScreen,
  Sex: SexScreen,
  Age: AgeScreen,
  Body: BodyScreen,
  Activity: ActivityScreen,
  Limitations: LimitationsScreen,
  Referral: ReferralScreen,
};

const Stack = createNativeStackNavigator();

export function OnboardingNavigator({ preview = false }: { preview?: boolean }) {
  return (
    <OnboardingProvider preview={preview}>
      <Stack.Navigator
        initialRouteName={ONBOARDING_STEPS[0].key}
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          animation: 'slide_from_right',
          animationDuration: 280,
        }}
      >
        {ONBOARDING_STEPS.map((step) => (
          <Stack.Screen
            key={step.key}
            name={step.key}
            component={SCREENS[step.key]}
            initialParams={step.params}
            // The interstitial scores and saves; letting the user swipe back
            // into it would bounce them straight forward again.
            options={step.key === 'CoachMatching' ? { gestureEnabled: false } : undefined}
          />
        ))}
        <Stack.Screen
          name={BUILDING_ROUTE}
          component={BuildingPlanScreen}
          options={{ gestureEnabled: false }}
        />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}

/**
 * The onboarding question flow, mounted three ways:
 * - `preAuth` — inside AuthNavigator, before any account exists. The last
 *   question stashes the draft and hands off to SignUp.
 * - by RootGate with `resumeDraft` — post-signup pickup of a stashed draft;
 *   opens directly on BuildingPlan, which PUTs the answers then generates.
 * - by RootGate bare — legacy accounts with no onboarded_at and no stash get
 *   the questions post-auth, exactly as before the inversion.
 * (`preview` is the dev replay from Settings — no server writes at all.)
 *
 * The running order lives in `screens/onboarding/steps.ts`. This file only
 * maps step keys to components — that split is what keeps the registry free of
 * component imports, so screens can read it without a require cycle.
 */
import type { ComponentType } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  OnboardingProvider,
  type OnboardingDraft,
} from '@/screens/onboarding/OnboardingContext';
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
import { PreparingScreen } from '@/screens/onboarding/PreparingScreen';
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

export function OnboardingNavigator({
  preview = false,
  preAuth = false,
  resumeDraft,
}: {
  preview?: boolean;
  preAuth?: boolean;
  /** Stashed pre-auth draft: seed the provider and open on BuildingPlan. */
  resumeDraft?: OnboardingDraft;
}) {
  return (
    <OnboardingProvider preview={preview} preAuth={preAuth} resumeDraft={resumeDraft}>
      <Stack.Navigator
        initialRouteName={resumeDraft ? BUILDING_ROUTE : ONBOARDING_STEPS[0].key}
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
        {/* Pre-auth interstitial between the last question and SignUp. */}
        <Stack.Screen
          name="Preparing"
          component={PreparingScreen}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name={BUILDING_ROUTE}
          component={BuildingPlanScreen}
          options={{ gestureEnabled: false }}
        />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}

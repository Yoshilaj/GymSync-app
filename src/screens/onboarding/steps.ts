/**
 * The onboarding running order — the single source of truth for sequence,
 * branching, and which steps may be skipped.
 *
 * Deliberately holds NO component references: screens import `useStepFlow`,
 * which reads this file, so a component map here would close a require cycle.
 * The navigator owns the key -> component mapping instead.
 *
 * Reordering the flow means editing this array and nothing else.
 */
import type { OnboardingDraft } from './OnboardingContext';

export interface StepDef {
  /** Route name in OnboardingNavigator. */
  key: string;
  /** Omit to always show. Hidden steps drop out of the progress denominator. */
  isVisible?: (draft: OnboardingDraft) => boolean;
  /** Renders a full-contrast Skip in the header. */
  optional?: boolean;
  /** Passed to the screen as initialParams. */
  params?: Record<string, unknown>;
}

export const ONBOARDING_STEPS: StepDef[] = [
  { key: 'Goal' },
  { key: 'Experience' },
  { key: 'Source', optional: true },
  { key: 'TrainingDays' },
  { key: 'SessionLength' },
  { key: 'TrainingPlace' },
  // Only asked when there's something to ask about — a full gym and bodyweight
  // both imply their own equipment list.
  { key: 'Equipment', isVisible: (d) => d.trainingPlace === 'home' },
  { key: 'CoachQ1', params: { qIndex: 0 } },
  { key: 'CoachQ2', params: { qIndex: 1 } },
  { key: 'CoachQ3', params: { qIndex: 2 } },
  { key: 'CoachQ4', params: { qIndex: 3 } },
  { key: 'CoachMatching' },
  { key: 'CoachReveal' },
  { key: 'Sex' },
  { key: 'Age' },
  { key: 'Body' },
  { key: 'Activity' },
  { key: 'Limitations', optional: true },
  { key: 'Referral', optional: true },
];

/** Where the flow lands once the last step is done. */
export const BUILDING_ROUTE = 'BuildingPlan';

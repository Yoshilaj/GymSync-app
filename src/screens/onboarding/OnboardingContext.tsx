/**
 * Draft state for the onboarding flow. Values live here in the user's chosen
 * units; submit() converts to canonical metric, PUTs the whole profile (which
 * stamps onboarded_at server-side), and requests the plan-kickoff handoff so
 * RootNavigator opens on Sync and auto-sends the first-plan message.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import type { Units } from '@/types';
import type { ActivityLevel, ExperienceLevel, Sex } from '@/api/profile';
import { useUser } from '@/context/UserContext';
import { ftInToCm, lbsToKg } from '@/lib/units';
import { requestPlanKickoff } from '@/lib/planKickoff';

export interface OnboardingDraft {
  goals: string[];
  experience: ExperienceLevel | null;
  trainingDays: number | null;
  sessionMinutes: number | null;
  equipment: string[];
  sex: Sex | null; // null = prefer not to say (allowed)
  /** True when the user explicitly chose "prefer not to say". */
  sexAnsweredSkip: boolean;
  birthYear: number | null;
  activityLevel: ActivityLevel | null;
  units: Units;
  // Raw input strings so the fields behave like normal text inputs.
  heightFeet: string;
  heightInches: string;
  heightCm: string;
  weight: string; // in `units`
  injuriesNote: string;
}

const INITIAL: OnboardingDraft = {
  goals: [],
  experience: null,
  trainingDays: null,
  sessionMinutes: null,
  equipment: [],
  sex: null,
  sexAnsweredSkip: false,
  birthYear: null,
  activityLevel: null,
  units: 'lbs',
  heightFeet: '',
  heightInches: '',
  heightCm: '',
  weight: '',
  injuriesNote: '',
};

interface OnboardingContextValue {
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  toggleInList: (key: 'goals' | 'equipment', value: string) => void;
  /** Height in cm derived from the raw inputs, or null when incomplete. */
  heightCmValue: number | null;
  /** Weight in kg derived from the raw input, or null when incomplete. */
  weightKgValue: number | null;
  submitting: boolean;
  submitError: string | null;
  submit: () => Promise<boolean>;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, profile, saveProfile, setUnits } = useUser();
  const [draft, setDraft] = useState<OnboardingDraft>({
    ...INITIAL,
    units: user.units,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const patch = useCallback((p: Partial<OnboardingDraft>) => {
    setDraft((prev) => ({ ...prev, ...p }));
  }, []);

  const toggleInList = useCallback((key: 'goals' | 'equipment', value: string) => {
    setDraft((prev) => {
      const list = prev[key];
      return {
        ...prev,
        [key]: list.includes(value)
          ? list.filter((v) => v !== value)
          : [...list, value],
      };
    });
  }, []);

  const heightCmValue = useMemo(() => {
    if (draft.units === 'kg') {
      const cm = Number(draft.heightCm);
      return Number.isFinite(cm) && cm >= 90 && cm <= 250 ? cm : null;
    }
    const feet = Number(draft.heightFeet);
    const inches = Number(draft.heightInches || '0');
    if (!Number.isFinite(feet) || !Number.isFinite(inches) || feet <= 0) return null;
    const cm = ftInToCm(feet, inches);
    return cm >= 90 && cm <= 250 ? cm : null;
  }, [draft.units, draft.heightCm, draft.heightFeet, draft.heightInches]);

  const weightKgValue = useMemo(() => {
    const raw = Number(draft.weight);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const kg = draft.units === 'kg' ? raw : lbsToKg(raw);
    return kg >= 25 && kg <= 350 ? kg : null;
  }, [draft.units, draft.weight]);

  const submit = useCallback(async (): Promise<boolean> => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await saveProfile({
        goals: draft.goals,
        experience: draft.experience,
        training_days: draft.trainingDays,
        session_minutes: draft.sessionMinutes,
        equipment: draft.equipment,
        sex: draft.sex,
        birth_year: draft.birthYear,
        activity_level: draft.activityLevel,
        height_cm: heightCmValue,
        weight_kg: weightKgValue,
        units: draft.units,
        preferences: {
          ...(profile?.preferences ?? {}),
          ...(draft.injuriesNote.trim()
            ? { injuries_note: draft.injuriesNote.trim() }
            : null),
        },
        complete_onboarding: true,
      });
      setUnits(draft.units);
      requestPlanKickoff();
      return true;
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not save your profile.',
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [draft, heightCmValue, weightKgValue, profile, saveProfile, setUnits]);

  const value: OnboardingContextValue = {
    draft,
    patch,
    toggleInList,
    heightCmValue,
    weightKgValue,
    submitting,
    submitError,
    submit,
  };

  return (
    <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}

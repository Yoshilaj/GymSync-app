/**
 * Draft state for the onboarding flow. Values live here in the user's chosen
 * units. saveProfileDraft() converts to canonical metric and PUTs the profile
 * WITHOUT the completion flag (the gate must stay put while BuildingPlan
 * generates); completeOnboarding() repeats the write WITH the flag once the
 * plan is accepted (or skipped), which flips RootGate into the app.
 *
 * Three run modes, mutually exclusive:
 * - default (post-auth): both writes are real PUTs. Legacy accounts that
 *   signed up before pre-auth onboarding existed still take this path.
 * - `preview` (dev only): the whole flow runs against nothing — both writes
 *   are no-ops so the real profile is never touched (Settings replay).
 * - `preAuth`: the questions run before an account exists. Writes are no-ops;
 *   the finished draft is stashed (draftStash.ts) and the flow hands off to
 *   SignUp. Once a session appears, RootGate remounts this provider with
 *   `resumeDraft` — the stashed answers seed the state, `needsSubmit` tells
 *   BuildingPlan to PUT them before generating.
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
import type { AnonymousProfilePayload } from '@/api/plan';
import type { PlanProposalWire } from '@/voice/protocol';
import { useUser } from '@/context/UserContext';
import { ftInToCm, lbsToKg } from '@/lib/units';
import type { TrainingPlace } from './options';
import { matchCoach } from './coachMatch';
import { stashPendingDraft } from './draftStash';

export interface OnboardingDraft {
  goals: string[]; // single primary goal, kept as a list for the wire format
  experience: ExperienceLevel | null;
  attribution: string | null;
  trainingDays: number | null;
  sessionMinutes: number | null;
  trainingPlace: TrainingPlace | null;
  equipment: string[];
  /** questionId -> chosen option value; scored by matchCoach(). */
  coachAnswers: Record<string, string>;
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
  injuryAreas: string[];
  injuriesNote: string;
  referralCode: string;
}

/** Multi-select draft keys — the ones `toggleInList` may touch. */
type ListKey = 'equipment' | 'injuryAreas';

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Wheels open on a sensible value rather than empty. The old flow seeded these
 * from a mount effect purely so Continue would light up without a scroll —
 * a default belongs in the initial state, not in a side effect.
 */
function initialDraft(units: Units): OnboardingDraft {
  const metric = units === 'kg';
  return {
    goals: [],
    experience: null,
    attribution: null,
    trainingDays: null,
    sessionMinutes: 60,
    trainingPlace: null,
    equipment: [],
    coachAnswers: {},
    sex: null,
    sexAnsweredSkip: false,
    birthYear: CURRENT_YEAR - 27,
    activityLevel: null,
    units,
    heightFeet: metric ? '' : '5',
    heightInches: metric ? '' : '9',
    heightCm: metric ? '175' : '',
    weight: metric ? '75' : '165',
    injuryAreas: [],
    injuriesNote: '',
    referralCode: '',
  };
}

/** Realistic answers so a dev replay can jump straight to any step. */
function previewDraft(units: Units): OnboardingDraft {
  return {
    ...initialDraft(units),
    goals: ['muscle'],
    experience: 'intermediate',
    attribution: 'instagram',
    trainingDays: 4,
    trainingPlace: 'gym',
    equipment: ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Kettlebell', 'Bodyweight'],
    coachAnswers: {
      drive: 'numbers',
      setback: 'analyse',
      room: 'quiet',
      pride: 'lifts',
    },
    sex: 'male',
    activityLevel: 'moderate',
  };
}

interface OnboardingContextValue {
  draft: OnboardingDraft;
  patch: (p: Partial<OnboardingDraft>) => void;
  toggleInList: (key: ListKey, value: string) => void;
  /** Height in cm derived from the raw inputs, or null when incomplete. */
  heightCmValue: number | null;
  /** Weight in kg derived from the raw input, or null when incomplete. */
  weightKgValue: number | null;
  submitting: boolean;
  submitError: string | null;
  /** Dev replay — nothing in this run touches the server. */
  preview: boolean;
  /** Running before an account exists — no network, stash at the end. */
  preAuth: boolean;
  /** Seeded from a stashed pre-auth draft; BuildingPlan must PUT it first. */
  needsSubmit: boolean;
  /** preAuth end-of-flow: persist the draft for the post-signup pickup. */
  stashDraft: () => Promise<boolean>;
  /** Re-stash with the pre-signup generated plan so it survives the auth
   *  boundary alongside the answers that produced it. */
  stashDraftWithPlan: (plan: PlanProposalWire) => Promise<boolean>;
  /** The draft as the anonymous-generation request body. */
  buildAnonymousPayload: () => AnonymousProfilePayload;
  /** Plan generated pre-signup (from the stash) — BuildingPlan adopts it
   *  instead of regenerating. Null when none survived. */
  stashedPlan: PlanProposalWire | null;
  /**
   * Persist the profile WITHOUT completing onboarding — the gate must not
   * flip while the BuildingPlan step is still generating.
   */
  saveProfileDraft: () => Promise<boolean>;
  /** Final write WITH the completion flag — flips the gate into the app. */
  completeOnboarding: () => Promise<boolean>;
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export function OnboardingProvider({
  children,
  preview = false,
  preAuth = false,
  resumeDraft,
  resumePlan = null,
}: {
  children: ReactNode;
  preview?: boolean;
  preAuth?: boolean;
  /** A stashed pre-auth draft to resume from (post-signup BuildingPlan run). */
  resumeDraft?: OnboardingDraft;
  /** The plan stashed alongside it, if generation succeeded pre-signup. */
  resumePlan?: PlanProposalWire | null;
}) {
  const { user, profile, saveProfile, setUnits } = useUser();
  // A resumed draft seeds state VERBATIM — never merged over initialDraft,
  // whose units come from the not-yet-hydrated local user and could disagree.
  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    resumeDraft ?? (preview ? previewDraft(user.units) : initialDraft(user.units)),
  );
  const needsSubmit = !!resumeDraft && !preview;
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const patch = useCallback((p: Partial<OnboardingDraft>) => {
    setDraft((prev) => ({ ...prev, ...p }));
  }, []);

  const toggleInList = useCallback((key: ListKey, value: string) => {
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

  const buildPayload = useCallback(
    (complete: boolean) => ({
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
      // The backend replaces `preferences` wholesale, so anything already
      // there (theme, notification toggles) has to be carried forward.
      preferences: {
        ...(profile?.preferences ?? {}),
        ...(draft.trainingPlace ? { training_place: draft.trainingPlace } : null),
        ...(draft.attribution ? { attribution: draft.attribution } : null),
        // The authority is PUT /api/personality; this is a record of what the
        // quiz produced, so a support question can be answered later.
        ...(Object.keys(draft.coachAnswers).length
          ? {
              coach_preset: matchCoach(draft.coachAnswers),
              coach_answers: draft.coachAnswers,
            }
          : null),
        ...(draft.injuryAreas.length ? { injury_areas: draft.injuryAreas } : null),
        ...(draft.injuriesNote.trim()
          ? { injuries_note: draft.injuriesNote.trim() }
          : null),
        ...(draft.referralCode.trim()
          ? { referral_code: draft.referralCode.trim() }
          : null),
      },
      complete_onboarding: complete,
    }),
    [draft, heightCmValue, weightKgValue, profile],
  );

  const stashDraft = useCallback(() => stashPendingDraft(draft), [draft]);

  const stashDraftWithPlan = useCallback(
    (plan: PlanProposalWire) => stashPendingDraft(draft, plan),
    [draft],
  );

  const buildAnonymousPayload = useCallback(
    (): AnonymousProfilePayload => ({
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
      injuries_note: draft.injuriesNote.trim() || null,
      injury_areas: draft.injuryAreas,
      coach_preset: Object.keys(draft.coachAnswers).length
        ? matchCoach(draft.coachAnswers)
        : null,
    }),
    [draft, heightCmValue, weightKgValue],
  );

  const save = useCallback(
    async (complete: boolean): Promise<boolean> => {
      // preAuth has no token to PUT with — the draft travels via the stash.
      if (preview || preAuth) return true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        await saveProfile(buildPayload(complete));
        setUnits(draft.units);
        return true;
      } catch (e) {
        setSubmitError(
          e instanceof Error ? e.message : 'Could not save your profile.',
        );
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [preview, preAuth, buildPayload, draft.units, saveProfile, setUnits],
  );

  const saveProfileDraft = useCallback(() => save(false), [save]);
  const completeOnboarding = useCallback(() => save(true), [save]);

  const value: OnboardingContextValue = {
    draft,
    patch,
    toggleInList,
    heightCmValue,
    weightKgValue,
    submitting,
    submitError,
    preview,
    preAuth,
    needsSubmit,
    stashDraft,
    stashDraftWithPlan,
    buildAnonymousPayload,
    stashedPlan: resumePlan,
    saveProfileDraft,
    completeOnboarding,
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

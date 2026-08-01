/**
 * Workout-plan API — the durable weekly plan and agent plan proposals.
 *
 * The server returns the normalized plan tree (plan_store.py shape); this
 * module maps it into the client's WeeklyPlan type so every screen keeps
 * consuming the shape it always has.
 */
import { kgToLbs } from '@/lib/units';

type WeightUnit = 'kg' | 'lbs';

import { voiceConfig } from '@/voice/config';
import { ApiError, authedFetch } from './client';
import { parseUpgrade, UpgradeRequiredError } from '@/billing/upgrade';
import type { PlannedExercise, PlannedWorkout, WeeklyPlan } from '@/types';
import type { PlanProposalWire } from '@/voice/protocol';

const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Defensive mirror of the server's day-label canon (older plans, drift). */
function canonDayLabel(raw: string): string {
  const head = raw.trim().slice(0, 3).toLowerCase();
  const hit = WEEK_LABELS.find((d) => d.toLowerCase() === head);
  return hit ?? raw;
}

/** Server plan tree (backend/app/plan_store.py build_plan_tree). */
interface ServerPlanExercise {
  /** plan_exercises.id — what add/delete address. */
  id: string;
  exercise_id: string | null;
  exercise_name: string;
  target_sets: {
    id: string;
    exerciseId: string;
    targetReps: number;
    repsHigh?: number;
    weight: number | null;
  }[];
  note: string | null;
  sort_order: number;
}

interface ServerPlanWorkout {
  id: string;
  day_label: string;
  title: string;
  est_minutes: number | null;
  sort_order: number;
  exercises: ServerPlanExercise[];
}

export interface ServerPlanTree {
  plan_id: string;
  name: string;
  is_active: boolean;
  workouts: ServerPlanWorkout[];
}

/** Carries the status so callers can tell "plan moved on" (409) and "already
 *  gone" (404) apart from a real failure, plus the server's own sentence when
 *  there is one — "already in this workout" is worth showing verbatim. */
export class PlanApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: string,
  ) {
    super(message);
    this.name = 'PlanApiError';
  }
}

async function request<T>(
  token: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  try {
    return await authedFetch<T>(`/api${path}`, token, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (e) {
    return rethrowPlanError(e, `Plans ${method} ${path}`);
  }
}

/**
 * Turn a failed response into the most specific error we can.
 *
 * An entitlement refusal arrives as a 403 whose `detail` is an OBJECT, not the
 * string these handlers usually send — so reading only strings (as this file
 * used to) collapsed "upgrade to Pro" into a generic failure and left every
 * call site unable to tell it apart from a server error. That is why plan
 * generation could never have shown a paywall.
 */
/**
 * The same mapping, for a failure that already came back through api/client.ts.
 * The shared client has done the 401-refresh-and-retry by this point; what's left
 * is turning the body into the most specific error this module knows about.
 */
function rethrowPlanError(e: unknown, label: string): never {
  if (!(e instanceof ApiError)) throw e;
  // A session that has already been signed out isn't a plan problem — let it
  // through untouched so the caller doesn't report it as one.
  if (e.signedOut || e.mfaRequired) throw e;

  const upgrade = parseUpgrade(e.detail);
  if (upgrade) throw new UpgradeRequiredError(upgrade);

  throw new PlanApiError(
    e.status,
    `${label} failed (HTTP ${e.status})`,
    typeof e.detail === 'string' ? e.detail : undefined,
  );
}

async function raiseForStatus(res: Response, label: string): Promise<never> {
  const body = await res.json().catch(() => null);
  const detail = body?.detail;

  const upgrade = parseUpgrade(detail);
  if (upgrade) throw new UpgradeRequiredError(upgrade);

  throw new PlanApiError(
    res.status,
    `${label} failed (HTTP ${res.status})`,
    typeof detail === 'string' ? detail : undefined,
  );
}

/**
 * One server row → one PlannedExercise. Extracted so loading a whole plan and
 * appending a single exercise can't drift on the ad-hoc id fallback or the
 * null-weight coercion.
 */
/**
 * Server target weights are kilograms (migration 017) — they're seeded from the
 * user's own logged sets, which are canonical kg. Convert once, here, so no
 * screen has to remember: this file is the only boundary plan data crosses.
 */
function displayWeight(kg: number | null | undefined, units: WeightUnit): number {
  if (kg == null) return 0;
  return units === 'kg' ? Math.round(kg * 10) / 10 : kgToLbs(kg);
}

function toPlannedExercise(ex: ServerPlanExercise, units: WeightUnit): PlannedExercise {
  // Uncatalogued exercises have no exercise_id; synthesize a stable key so
  // resolvePlannedExercise can still find them by name.
  const exerciseId = ex.exercise_id ?? `name:${ex.exercise_name}`;
  return {
    id: ex.id,
    exerciseId,
    name: ex.exercise_name,
    note: ex.note ?? undefined,
    sets: (ex.target_sets ?? []).map((s) => ({
      id: s.id,
      exerciseId: s.exerciseId || exerciseId,
      targetReps: s.targetReps,
      repsHigh: s.repsHigh,
      weight: displayWeight(s.weight, units),
    })),
  };
}

export function toWeeklyPlan(tree: ServerPlanTree, units: WeightUnit): WeeklyPlan {
  const workouts: PlannedWorkout[] = tree.workouts.map((w) => ({
    id: w.id,
    dayLabel: canonDayLabel(w.day_label),
    title: w.title,
    estMinutes: w.est_minutes ?? 45,
    exercises: w.exercises.map((e) => toPlannedExercise(e, units)),
  }));

  const trainingDays = new Set(workouts.map((w) => w.dayLabel));
  return {
    planId: tree.plan_id,
    startDate: new Date().toISOString().slice(0, 10),
    workouts,
    restDays: WEEK_LABELS.filter((d) => !trainingDays.has(d)),
  };
}

/** The user's active plan, or null when none exists yet. */
export async function fetchActivePlan(
  token: string,
  units: WeightUnit,
): Promise<WeeklyPlan | null> {
  const data = await request<{ plan: ServerPlanTree | null }>(token, 'GET', '/plans/active');
  return data.plan ? toWeeklyPlan(data.plan, units) : null;
}

/**
 * Append an exercise to a plan day. The server assigns the row id and
 * sort_order, and may downgrade an unknown exercise_id to an ad-hoc row — so
 * the created row comes back rather than being guessed at locally.
 */
export async function addPlanExercise(
  token: string,
  workoutId: string,
  input: { exerciseId: string | null; exerciseName: string; note?: string },
  units: WeightUnit,
): Promise<PlannedExercise> {
  const data = await request<{ exercise: ServerPlanExercise }>(
    token,
    'POST',
    `/plans/workouts/${workoutId}/exercises`,
    {
      exercise_id: input.exerciseId,
      exercise_name: input.exerciseName,
      note: input.note ?? null,
    },
  );
  return toPlannedExercise(data.exercise, units);
}

/**
 * Remove a plan exercise. A 404 means it's already gone — which is the
 * outcome we wanted — so it resolves instead of throwing, making a
 * double-tapped delete harmless.
 */
export async function deletePlanExercise(
  token: string,
  planExerciseId: string,
): Promise<void> {
  try {
    await request(token, 'DELETE', `/plans/exercises/${planExerciseId}`);
  } catch (err) {
    if (err instanceof PlanApiError && err.status === 404) return;
    throw err;
  }
}

/** Accept a chat plan proposal — materializes it as the new active plan. */
export async function acceptPlanProposal(
  token: string,
  proposalId: string,
  units: WeightUnit,
): Promise<WeeklyPlan> {
  const data = await request<{ plan: ServerPlanTree }>(
    token,
    'POST',
    `/plans/proposals/${proposalId}/accept`,
  );
  return toWeeklyPlan(data.plan, units);
}

export interface GeneratedProposal {
  proposal_id: string;
  plan: PlanProposalWire;
  warnings: string[];
}

/** One-shot plan generation (onboarding). Long-running — generous timeout. */
export async function generatePlan(token: string): Promise<GeneratedProposal> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    // Through the shared client so a token that expires during a two-minute
    // generation refreshes and retries instead of throwing the work away.
    return await authedFetch<GeneratedProposal>('/api/plans/generate', token, {
      method: 'POST',
      signal: controller.signal,
    });
  } catch (e) {
    return rethrowPlanError(e, 'Plan generation');
  } finally {
    clearTimeout(timer);
  }
}

/** The onboarding answers, shaped like the profile row they'll become —
 * mirrors the server's AnonymousProfile model. */
export interface AnonymousProfilePayload {
  goals: string[];
  experience: string | null;
  training_days: number | null;
  session_minutes: number | null;
  equipment: string[];
  training_place: string | null;
  sex: string | null;
  birth_year: number | null;
  activity_level: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  units: string | null;
  injuries_note: string | null;
  injury_areas: string[];
  coach_preset: string | null;
}

/** Pre-signup generation for the onboarding reveal. No token, nothing
 * persists server-side — the plan rides the draft stash across signup. */
export async function generateAnonymousPlan(
  payload: AnonymousProfilePayload,
): Promise<{ plan: PlanProposalWire; warnings: string[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(
      `${voiceConfig.apiBaseUrl}/api/plans/generate-anonymous`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
    if (!res.ok) await raiseForStatus(res, 'Plan generation');
    return (await res.json()) as { plan: PlanProposalWire; warnings: string[] };
  } finally {
    clearTimeout(timer);
  }
}

/** Store a pre-signup plan as this user's pending proposal — the plan the
 * user was already shown must not be silently regenerated after signup. */
export async function adoptPlanProposal(
  token: string,
  plan: PlanProposalWire,
): Promise<{ proposal_id: string; plan: PlanProposalWire }> {
  return request<{ proposal_id: string; plan: PlanProposalWire }>(
    token,
    'POST',
    '/plans/proposals/adopt',
    { plan },
  );
}

/** The still-pending proposal, if any (crash/reload recovery in onboarding). */
export async function fetchLatestProposal(
  token: string,
): Promise<{ id: string; payload: PlanProposalWire } | null> {
  const data = await request<{
    proposal: { id: string; payload: PlanProposalWire } | null;
  }>(token, 'GET', '/plans/proposals/latest');
  return data.proposal;
}

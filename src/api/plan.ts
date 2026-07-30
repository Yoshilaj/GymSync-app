/**
 * Workout-plan API — the durable weekly plan and agent plan proposals.
 *
 * The server returns the normalized plan tree (plan_store.py shape); this
 * module maps it into the client's WeeklyPlan type so every screen keeps
 * consuming the shape it always has.
 */
import { voiceConfig } from '@/voice/config';
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
  const res = await fetch(`${voiceConfig.apiBaseUrl}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    await raiseForStatus(res, `Plans ${method} ${path}`);
  }
  return (await res.json()) as T;
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
function toPlannedExercise(ex: ServerPlanExercise): PlannedExercise {
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
      weight: s.weight ?? 0,
    })),
  };
}

export function toWeeklyPlan(tree: ServerPlanTree): WeeklyPlan {
  const workouts: PlannedWorkout[] = tree.workouts.map((w) => ({
    id: w.id,
    dayLabel: canonDayLabel(w.day_label),
    title: w.title,
    estMinutes: w.est_minutes ?? 45,
    exercises: w.exercises.map(toPlannedExercise),
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
export async function fetchActivePlan(token: string): Promise<WeeklyPlan | null> {
  const data = await request<{ plan: ServerPlanTree | null }>(token, 'GET', '/plans/active');
  return data.plan ? toWeeklyPlan(data.plan) : null;
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
  return toPlannedExercise(data.exercise);
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
): Promise<WeeklyPlan> {
  const data = await request<{ plan: ServerPlanTree }>(
    token,
    'POST',
    `/plans/proposals/${proposalId}/accept`,
  );
  return toWeeklyPlan(data.plan);
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
    const res = await fetch(`${voiceConfig.apiBaseUrl}/api/plans/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) await raiseForStatus(res, 'Plan generation');
    return (await res.json()) as GeneratedProposal;
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
  const res = await fetch(`${voiceConfig.apiBaseUrl}/api/plans/proposals/adopt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) await raiseForStatus(res, 'Plan adopt');
  return (await res.json()) as { proposal_id: string; plan: PlanProposalWire };
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

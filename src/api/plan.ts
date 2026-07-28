/**
 * Workout-plan API — the durable weekly plan and agent plan proposals.
 *
 * The server returns the normalized plan tree (plan_store.py shape); this
 * module maps it into the client's WeeklyPlan type so every screen keeps
 * consuming the shape it always has.
 */
import { voiceConfig } from '@/voice/config';
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

async function request<T>(
  token: string,
  method: 'GET' | 'POST',
  path: string,
): Promise<T> {
  const res = await fetch(`${voiceConfig.apiBaseUrl}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Plans ${method} ${path} failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

export function toWeeklyPlan(tree: ServerPlanTree): WeeklyPlan {
  const workouts: PlannedWorkout[] = tree.workouts.map((w) => ({
    id: w.id,
    dayLabel: canonDayLabel(w.day_label),
    title: w.title,
    estMinutes: w.est_minutes ?? 45,
    exercises: w.exercises.map((ex): PlannedExercise => {
      const exerciseId = ex.exercise_id ?? `name:${ex.exercise_name}`;
      return {
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
    }),
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
    if (!res.ok) throw new Error(`Plan generation failed (HTTP ${res.status})`);
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
    if (!res.ok) throw new Error(`Plan generation failed (HTTP ${res.status})`);
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
  if (!res.ok) throw new Error(`Plan adopt failed (HTTP ${res.status})`);
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

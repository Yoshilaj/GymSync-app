/**
 * Workout-plan API — the durable weekly plan and agent plan proposals.
 *
 * The server returns the normalized plan tree (plan_store.py shape); this
 * module maps it into the client's WeeklyPlan type so every screen keeps
 * consuming the shape it always has.
 */
import { voiceConfig } from '@/voice/config';
import type { PlannedExercise, PlannedWorkout, WeeklyPlan } from '@/types';

const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
    dayLabel: w.day_label,
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

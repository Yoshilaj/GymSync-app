/**
 * Workout session lifecycle (POST/GET/PATCH/DELETE /api/session).
 * All calls go through api/client.ts, so an expired token refreshes and retries
 * once mid-workout rather than surfacing as a failed set.
 */
import { api, authedFetch } from './client';

export interface SessionSetRow {
  exercise_name: string;
  set_index: number;
  reps: number;
  weight: number | null;
  weight_unit: string | null;
}

export interface WorkoutSessionRow {
  id: string;
  user_id: string;
  current_exercise: string | null;
  is_active: boolean;
  plan_snapshot: unknown;
  updated_at?: string;
  /** Sent by GET /session/active only — the session's logged sets, for resume. */
  completed_sets?: SessionSetRow[];
  [key: string]: unknown;
}

/** POST /api/session — ends any existing active session and starts a new one. */
export async function createSession(
  token: string,
  planId: string | null = null,
  workoutId: string | null = null,
): Promise<WorkoutSessionRow> {
  const data = await api.post<{ session: WorkoutSessionRow }>('/api/session', token, {
    plan_id: planId,
    workout_id: workoutId,
  });
  return data.session;
}

/** GET /api/session/active — the one active session, or null. */
export async function fetchActiveSession(
  token: string,
): Promise<WorkoutSessionRow | null> {
  const data = await api.get<{ session: WorkoutSessionRow | null }>(
    '/api/session/active',
    token,
  );
  return data.session;
}

/** PATCH /api/session/{id} — update the exercise the user is on. */
export async function patchCurrentExercise(
  token: string,
  sessionId: string,
  currentExercise: string,
): Promise<void> {
  await authedFetch<void>(`/api/session/${sessionId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ current_exercise: currentExercise }),
  });
}

/** DELETE /api/session/{id} — end the session. */
export async function endSession(token: string, sessionId: string): Promise<void> {
  await api.del<void>(`/api/session/${sessionId}`, token);
}

/**
 * Workout session lifecycle (POST/GET/PATCH/DELETE /api/session).
 * All calls go through api/client.ts, so an expired token refreshes and retries
 * once mid-workout rather than surfacing as a failed set.
 */
import { parseUpgrade, UpgradeRequiredError } from '@/billing/upgrade';
import { api, ApiError, authedFetch } from './client';

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

/** Movement patterns the backend accepts for `avoid_movements` (MOVEMENTS in tools.py). */
export type Movement =
  | 'push' | 'pull' | 'hinge' | 'squat' | 'lunge' | 'carry' | 'core' | 'isolation';

export type Severity = 'mild' | 'moderate' | 'severe';

/**
 * Something the user tells the coach mid-workout by tapping instead of talking.
 *
 * An `injury` becomes a row the safety layer programs around; a `comment` is only ever
 * recalled semantically. Both are Premium, so a 403 here is a paywall prompt rather than
 * a failure — same rethrow shape as api/personality.ts.
 */
export interface SessionNote {
  kind: 'injury' | 'comment';
  text?: string;
  bodyPart?: string;
  severity?: Severity;
  avoidMovements?: Movement[];
}

function rethrowUpgrade(e: unknown): never {
  if (e instanceof ApiError) {
    const upgrade = parseUpgrade(e.detail);
    if (upgrade) throw new UpgradeRequiredError(upgrade);
  }
  throw e;
}

/** POST /api/session/{id}/note — report an injury or leave a note. */
export async function addSessionNote(
  token: string,
  sessionId: string,
  note: SessionNote,
): Promise<void> {
  await api
    .post<unknown>(`/api/session/${sessionId}/note`, token, {
      kind: note.kind,
      text: note.text ?? '',
      body_part: note.bodyPart ?? null,
      severity: note.severity ?? null,
      avoid_movements: note.avoidMovements ?? [],
    })
    .catch(rethrowUpgrade);
}

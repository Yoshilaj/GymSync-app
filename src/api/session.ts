import { voiceConfig } from '@/voice/config';

export interface WorkoutSessionRow {
  id: string;
  user_id: string;
  current_exercise: string | null;
  is_active: boolean;
  plan_snapshot: unknown;
  [key: string]: unknown;
}

function headers(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/** POST /api/session — ends any existing active session and starts a new one. */
export async function createSession(
  token: string,
  planId: string | null = null,
  workoutId: string | null = null,
): Promise<WorkoutSessionRow> {
  const res = await fetch(`${voiceConfig.apiBaseUrl}/api/session`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ plan_id: planId, workout_id: workoutId }),
  });
  if (!res.ok) throw new Error(`Session create failed (HTTP ${res.status})`);
  const data = (await res.json()) as { session: WorkoutSessionRow };
  return data.session;
}

/** GET /api/session/active — the one active session, or null. */
export async function fetchActiveSession(
  token: string,
): Promise<WorkoutSessionRow | null> {
  const res = await fetch(`${voiceConfig.apiBaseUrl}/api/session/active`, {
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Active session fetch failed (HTTP ${res.status})`);
  const data = (await res.json()) as { session: WorkoutSessionRow | null };
  return data.session;
}

/** PATCH /api/session/{id} — update the exercise the user is on. */
export async function patchCurrentExercise(
  token: string,
  sessionId: string,
  currentExercise: string,
): Promise<void> {
  const res = await fetch(`${voiceConfig.apiBaseUrl}/api/session/${sessionId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ current_exercise: currentExercise }),
  });
  if (!res.ok) throw new Error(`Session update failed (HTTP ${res.status})`);
}

/** DELETE /api/session/{id} — end the session. */
export async function endSession(
  token: string,
  sessionId: string,
): Promise<void> {
  const res = await fetch(`${voiceConfig.apiBaseUrl}/api/session/${sessionId}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Session end failed (HTTP ${res.status})`);
}

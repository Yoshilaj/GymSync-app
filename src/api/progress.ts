/**
 * Progress data client — summary stats, per-exercise trends, manual set
 * logging, and the body-weight log. All real numbers; zeros/empty for fresh
 * accounts.
 */
import { voiceConfig } from '@/voice/config';

export interface ProgressSummary {
  current_streak: number;
  days_this_week: number;
  week_target: number;
  prs_this_month: number;
}

export interface SeriesPoint {
  date: string; // ISO day
  value: number;
}

export interface BodyWeightPoint {
  day: string;
  weight_kg: number;
}

async function request<T>(
  token: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${voiceConfig.apiBaseUrl}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : null),
  });
  if (!res.ok) {
    throw new Error(`Progress ${method} ${path} failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

export function fetchProgressSummary(token: string): Promise<ProgressSummary> {
  return request<ProgressSummary>(token, 'GET', '/progress/summary');
}

export async function fetchExerciseSeries(
  token: string,
  exerciseId: string,
  metric: 'strength' | 'volume',
  days = 90,
): Promise<SeriesPoint[]> {
  const data = await request<{ points: SeriesPoint[] }>(
    token,
    'GET',
    `/progress/exercise/${encodeURIComponent(exerciseId)}?metric=${metric}&days=${days}`,
  );
  return data.points;
}

export interface SetLogBody {
  session_id: string;
  exercise_id?: string | null;
  exercise_name: string;
  set_index: number;
  reps: number;
  weight?: number | null;
  weight_unit?: string;
}

/** Persist a manually-completed set (fire-and-forget from the session UI). */
export function logCompletedSet(token: string, body: SetLogBody): Promise<unknown> {
  return request(token, 'POST', '/sets', body);
}

export function logBodyWeight(token: string, weightKg: number): Promise<unknown> {
  return request(token, 'POST', '/bodyweight', { weight_kg: weightKg });
}

export async function fetchBodyWeightSeries(
  token: string,
  days = 60,
): Promise<BodyWeightPoint[]> {
  const data = await request<{ points: BodyWeightPoint[] }>(
    token,
    'GET',
    `/bodyweight?days=${days}`,
  );
  return data.points;
}

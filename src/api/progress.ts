/**
 * Progress data client — summary stats, per-exercise trends, manual set
 * logging, and the body-weight log. All real numbers; zeros/empty for fresh
 * accounts.
 */
import { api } from './client';
import { localDayIso } from '@/lib/dates';

export interface ProgressSummary {
  current_streak: number;
  days_this_week: number;
  week_target: number;
  prs_this_month: number;
  /** Distinct exercise names, most recently trained first (absent on old servers). */
  recent_exercises?: string[];
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
  return method === 'GET'
    ? api.get<T>(`/api${path}`, token)
    : api.post<T>(`/api${path}`, token, body);
}

export function fetchProgressSummary(token: string): Promise<ProgressSummary> {
  // The user's calendar day rides along so streak/week math runs against
  // THEIR today, not the server's UTC day (which flips at 5pm in California).
  return request<ProgressSummary>(
    token,
    'GET',
    `/progress/summary?today_local=${localDayIso()}`,
  );
}

export async function fetchExerciseSeries(
  token: string,
  exerciseId: string,
  metric: 'strength' | 'volume',
  days = 90,
  /**
   * Display name of the exercise. When given, the server filters by
   * exercise_name (case-insensitive) instead of exercise_id — names are what
   * both logging paths reliably write (voice-logged sets often carry a NULL
   * id), so this is the filter that actually finds the data.
   */
  exerciseName?: string,
): Promise<SeriesPoint[]> {
  const nameParam = exerciseName
    ? `&name=${encodeURIComponent(exerciseName)}`
    : '';
  const data = await request<{ points: SeriesPoint[] }>(
    token,
    'GET',
    `/progress/exercise/${encodeURIComponent(exerciseId)}?metric=${metric}&days=${days}${nameParam}`,
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
  /** ISO timestamp of when the set was performed — sent by the outbox so a
   * delayed sync lands on the right day (server clamps it). */
  performed_at?: string;
  /** The user's local YYYY-MM-DD at tap time — what day-based stats bucket
   * on (a UTC bucket splits evening workouts west of Greenwich). */
  local_day?: string;
}

/** Persist a manually-completed set (fire-and-forget from the session UI). */
export function logCompletedSet(token: string, body: SetLogBody): Promise<unknown> {
  return request(token, 'POST', '/sets', body);
}

export function logBodyWeight(
  token: string,
  weightKg: number,
  day?: string, // YYYY-MM-DD; omitted = today
): Promise<unknown> {
  return request(token, 'POST', '/bodyweight', {
    weight_kg: weightKg,
    ...(day ? { day } : null),
  });
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

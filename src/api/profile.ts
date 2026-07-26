/**
 * Server profile — the onboarding data layer (GET/PUT /api/profile).
 * Anthropometrics travel in canonical metric; convert via src/lib/units.ts.
 */
import { voiceConfig } from '@/voice/config';
import type { Units } from '@/types';

export type Sex = 'male' | 'female';
export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'very_active'
  | 'athlete';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export interface ServerProfile {
  display_name: string | null;
  units: Units;
  experience: ExperienceLevel | null;
  goals: string[];
  preferences: Record<string, unknown>;
  sex: Sex | null;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  training_days: number | null;
  session_minutes: number | null;
  equipment: string[];
  onboarded_at: string | null;
}

export interface ProfileResponse {
  profile: ServerProfile;
  onboarded: boolean;
}

async function request<T>(
  token: string,
  method: 'GET' | 'PUT',
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${voiceConfig.apiBaseUrl}/api/profile`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : null),
  });
  if (!res.ok) {
    throw new Error(`Profile ${method} failed (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchProfile(token: string): Promise<ProfileResponse> {
  return request<ProfileResponse>(token, 'GET');
}

export async function updateProfile(
  token: string,
  patch: Partial<ServerProfile> & { complete_onboarding?: boolean },
): Promise<ProfileResponse> {
  return request<ProfileResponse>(token, 'PUT', patch);
}

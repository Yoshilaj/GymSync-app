/**
 * Server profile — the onboarding data layer (GET/PUT /api/profile).
 * Anthropometrics travel in canonical metric; convert via src/lib/units.ts.
 */
import type { Units } from '@/types';
import { api } from './client';

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
  avatar_url: string | null;
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

export async function fetchProfile(token: string): Promise<ProfileResponse> {
  return api.get<ProfileResponse>('/api/profile', token);
}

export async function updateProfile(
  token: string,
  patch: Partial<ServerProfile> & { complete_onboarding?: boolean },
): Promise<ProfileResponse> {
  return api.put<ProfileResponse>('/api/profile', token, patch);
}

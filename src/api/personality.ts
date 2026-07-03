import { voiceConfig } from '@/voice/config';
import { CoachPersonality } from '@/types';

export interface PersonalityResponse {
  preset_id: CoachPersonality;
  name: string;
  voice_id: string;
  available_presets: { id: CoachPersonality; name: string }[];
}

async function request(
  token: string,
  method: 'GET' | 'PUT',
  body?: object,
): Promise<PersonalityResponse> {
  const res = await fetch(`${voiceConfig.apiBaseUrl}/api/personality`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Personality ${method} failed (HTTP ${res.status})`);
  }
  return (await res.json()) as PersonalityResponse;
}

export function fetchPersonality(token: string): Promise<PersonalityResponse> {
  return request(token, 'GET');
}

export function updatePersonality(
  token: string,
  presetId: CoachPersonality,
): Promise<PersonalityResponse> {
  return request(token, 'PUT', { preset_id: presetId });
}

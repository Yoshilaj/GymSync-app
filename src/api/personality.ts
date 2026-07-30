import { voiceConfig } from '@/voice/config';
import { parseUpgrade, UpgradeRequiredError } from '@/billing/upgrade';
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
    // Switching coaches is a Pro capability, so a 403 here is a paywall prompt
    // rather than a failure. Onboarding's first write is never refused — the
    // server gates the CHANGE, not the initial quiz result.
    const upgrade = parseUpgrade(await res.json().then((b) => b?.detail).catch(() => null));
    if (upgrade) throw new UpgradeRequiredError(upgrade);
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

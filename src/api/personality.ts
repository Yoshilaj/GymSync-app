import { parseUpgrade, UpgradeRequiredError } from '@/billing/upgrade';
import { CoachPersonality } from '@/types';
import { api, ApiError } from './client';

export interface PersonalityResponse {
  preset_id: CoachPersonality;
  name: string;
  voice_id: string;
  available_presets: { id: CoachPersonality; name: string }[];
}

/** Switching coaches is a Pro capability, so a 403 here is a paywall prompt rather
 * than a failure. Onboarding's first write is never refused — the server gates the
 * CHANGE, not the initial quiz result. */
function rethrow(e: unknown): never {
  if (e instanceof ApiError) {
    const upgrade = parseUpgrade(e.detail);
    if (upgrade) throw new UpgradeRequiredError(upgrade);
  }
  throw e;
}

export function fetchPersonality(token: string): Promise<PersonalityResponse> {
  return api.get<PersonalityResponse>('/api/personality', token).catch(rethrow);
}

export function updatePersonality(
  token: string,
  presetId: CoachPersonality,
): Promise<PersonalityResponse> {
  return api
    .put<PersonalityResponse>('/api/personality', token, { preset_id: presetId })
    .catch(rethrow);
}

/** Account management — the destructive server action (delete). */
import { voiceConfig } from '@/voice/config';

/** Permanently delete the signed-in user and all their data (cascade). */
export async function deleteAccount(token: string): Promise<void> {
  const res = await fetch(`${voiceConfig.apiBaseUrl}/api/account`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Account delete failed (HTTP ${res.status})`);
  }
}

/** Account management — the destructive server action (delete). */
import { api } from './client';

/** Permanently delete the signed-in user and all their data (cascade). */
export async function deleteAccount(token: string): Promise<void> {
  await api.del<void>('/api/account', token);
}

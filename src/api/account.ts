/** Account management — the destructive server action (delete). */
import { api } from './client';

/**
 * Permanently delete the signed-in user and all their data (cascade).
 *
 * `password` re-authenticates. It may be omitted only when the session already
 * cleared a second factor this sign-in — the server makes that call, not us.
 */
export async function deleteAccount(token: string, password?: string): Promise<void> {
  await api.del<void>('/api/account', token, { password: password ?? null });
}

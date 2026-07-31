import { useCallback, useRef, useState } from 'react';
import {
  ConversationSummary,
  deleteConversation,
  fetchConversations,
} from '@/api/conversations';

/**
 * The history panel's list state. Stale-while-revalidate: refresh() keeps
 * showing the previous list while the fetch is in flight, so reopening the
 * panel never flashes empty.
 */
export function useConversations(getToken: () => Promise<string>) {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State, not a ref: consumers branch on this to decide between a skeleton and
  // the stale list, and a ref wouldn't schedule the render that swaps them.
  const [loadedOnce, setLoadedOnce] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const list = await fetchConversations(token);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history');
    } finally {
      setLoading(false);
      // Latch even on failure, so a fetch that errors falls through to the
      // error note rather than shimmering indefinitely.
      setLoadedOnce(true);
    }
  }, [getToken]);

  /** Optimistic delete; restores the row if the server call fails. */
  const remove = useCallback(
    async (id: string) => {
      const before = items;
      setItems((prev) => prev.filter((c) => c.id !== id));
      try {
        const token = await getToken();
        await deleteConversation(token, id);
      } catch (e) {
        setItems(before);
        setError(e instanceof Error ? e.message : 'Delete failed');
        throw e;
      }
    },
    [items, getToken],
  );

  /**
   * A conversation just got created (or replied to) on this device — surface
   * it at the top without waiting for a refetch.
   */
  const bump = useCallback((id: string, title: string) => {
    const now = new Date().toISOString();
    setItems((prev) => {
      const existing = prev.find((c) => c.id === id);
      const rest = prev.filter((c) => c.id !== id);
      return [
        existing
          ? { ...existing, updated_at: now }
          : { id, title, created_at: now, updated_at: now },
        ...rest,
      ];
    });
  }, []);

  return {
    items,
    loading,
    error,
    loadedOnce,
    refresh,
    remove,
    bump,
  };
}

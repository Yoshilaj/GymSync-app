/**
 * Drives the outbox (see lib/outbox.ts): drains whenever the app has a reason
 * to believe the network is back — sign-in, cold start, returning to the
 * foreground, and connectivity itself returning. Mounted ONCE, in RootGate;
 * screens that only want the badge subscribe via useOutboxPending.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { outbox } from '@/lib/outbox';

// Loaded lazily, NOT with a top-level import: expo-network resolves its native
// module at module-evaluation time and THROWS on a binary that doesn't bundle
// it (any dev client built before this was added) — which would kill the whole
// bundle before ErrorBoundary exists, the exact failure mode of the App Review
// blank-screen rejection. A require inside try/catch degrades to
// foreground-only drains instead.
function getNetworkModule(): typeof import('expo-network') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-network');
  } catch {
    return null;
  }
}

export function useOutboxSync(): number {
  const { session, getToken } = useAuth();
  const uid = session?.user?.id ?? null;
  const pending = useOutboxPending();

  useEffect(() => {
    if (!uid) {
      // Badge hygiene across account switches: never show the previous
      // account's pending count, even for a frame.
      outbox.resetCount();
      return;
    }
    void outbox.refreshCount(uid);
    void outbox.drain(uid, getToken);

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void outbox.drain(uid, getToken);
    });

    // The interesting trigger: signal coming back mid-session (leaving the
    // gym's dead zone) drains without waiting for a backgrounding. Optional —
    // see getNetworkModule above.
    let netSub: { remove: () => void } | null = null;
    const Network = getNetworkModule();
    if (Network) {
      try {
        netSub = Network.addNetworkStateListener(({ isConnected, isInternetReachable }) => {
          if (isConnected && isInternetReachable !== false) {
            void outbox.drain(uid, getToken);
          }
        });
      } catch {
        /* listener unavailable — foreground/enqueue drains still cover us */
      }
    }

    return () => {
      appSub.remove();
      netSub?.remove();
    };
  }, [uid, getToken]);

  return pending;
}

/** Subscribe to the number of queued writes without owning any drain logic. */
export function useOutboxPending(): number {
  const [pending, setPending] = useState(0);
  useEffect(() => outbox.subscribe(setPending), []);
  return pending;
}

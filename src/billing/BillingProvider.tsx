/**
 * The app's single StoreKit connection, and the entitlement everything reads.
 *
 * Mounted once, in App.tsx. `useIAP()` opens a native StoreKit connection and
 * registers transaction listeners; mounting it per screen would open several
 * and deliver the same purchase more than once.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 * A purchase is not access. The flow is always:
 *
 *   requestPurchase  → Apple's sheet, Apple's money
 *   purchaseToken    → an Apple-SIGNED transaction (the JWS)
 *   POST to backend  → verified against Apple's chain, stored, entitlement returned
 *   finishTransaction → ONLY now, and only because the backend said yes
 *
 * Finishing before verification would throw away the only durable record that
 * the purchase happened. StoreKit replays unfinished transactions on every
 * launch, which is precisely the safety net for a response that never arrives.
 *
 * ── The trap that has no natural escape ────────────────────────────────────
 * A transaction the backend PERMANENTLY rejects (already linked to another
 * account, unknown product) must still be finished, or StoreKit re-delivers it
 * on every launch forever and the app never gets past it. See `settle()`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import {
  useIAP,
  ErrorCode,
  deepLinkToSubscriptionsIOS,
  isEligibleForIntroOfferIOS,
  type Purchase,
  type ProductSubscription,
} from 'expo-iap';
import { useAuth } from '@/auth/AuthContext';
import {
  BillingError,
  FREE_ENTITLEMENT,
  fetchEntitlement,
  verifyPurchase,
  type Entitlement,
} from '@/api/billing';
import { SKUS, SUBSCRIPTION_GROUP_ID } from '@/screens/pricing/catalog';

const PRODUCT_IDS = SKUS.map((s) => s.productId);

export type EntitlementStatus = 'loading' | 'ready' | 'error';

/**
 * The outcome of submitting one Apple transaction.
 *
 * `done` means "stop retrying this" — true on success AND on permanent
 * rejection. `entitlement` is non-null only when access was actually granted.
 */
interface SettleResult {
  done: boolean;
  entitlement: Entitlement | null;
}

export interface BillingContextValue {
  /** StoreKit is connected and products have been requested. */
  connected: boolean;
  /** Apple's product metadata, keyed by product id. Empty until loaded. */
  products: Record<string, ProductSubscription>;
  entitlement: Entitlement;
  status: EntitlementStatus;
  /** Whether Apple says this customer may still have the introductory offer. */
  introEligible: boolean;
  /** Buy a SKU. Resolves with the new entitlement, or throws BillingError. */
  purchase: (productId: string) => Promise<Entitlement>;
  /** Re-apply purchases made on another device. Resolves to the entitlement found. */
  restore: () => Promise<Entitlement>;
  refresh: () => Promise<void>;
  manage: () => Promise<void>;
}

const BillingContext = createContext<BillingContextValue | null>(null);

export function BillingProvider({ children }: { children: ReactNode }) {
  const { session, getToken } = useAuth();
  const userId = session?.user?.id ?? null;

  const [entitlement, setEntitlement] = useState<Entitlement>(FREE_ENTITLEMENT);
  const [status, setStatus] = useState<EntitlementStatus>('loading');
  const [introEligible, setIntroEligible] = useState(false);

  // Resolvers for the in-flight purchase. StoreKit reports success through a
  // listener rather than by resolving requestPurchase, so the promise handed to
  // the paywall is settled from onPurchaseSuccess/onPurchaseError.
  const pending = useRef<{
    resolve: (e: Entitlement) => void;
    reject: (e: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  /**
   * Settle the in-flight purchase exactly once, and always clear its timer.
   *
   * Every settle path has to go through here. Resolving or rejecting `pending`
   * directly leaves the timeout armed, and it fires later against a promise
   * nobody is waiting on — or worse, against the *next* purchase.
   */
  const settlePending = useCallback(
    (outcome: { ok: true; value: Entitlement } | { ok: false; error: unknown }) => {
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      clearTimeout(p.timer);
      if (outcome.ok) p.resolve(outcome.value);
      else p.reject(outcome.error);
    },
    [],
  );
  const alive = useRef(true);
  // Fingerprints of transactions already settled with the backend this
  // session — see the reconcile effect below. Cleared on account change so a
  // second account never inherits the first's "already handled" set.
  const settledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    settledRef.current = new Set();
  }, [userId]);

  const {
    connected,
    subscriptions,
    fetchProducts,
    requestPurchase,
    finishTransaction,
    getAvailablePurchases,
    availablePurchases,
  } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void settle(purchase);
    },
    onPurchaseError: (err) => {
      const code =
        err.code === ErrorCode.UserCancelled
          ? 'cancelled'
          : err.code === ErrorCode.NetworkError
            ? 'network'
            : err.code === ErrorCode.ItemUnavailable
              ? 'unavailable'
              : 'unknown';
      settlePending({ ok: false, error: new BillingError(err.message, code) });
    },
  });

  /**
   * Verify one Apple transaction with the backend, then finish it.
   *
   * `done` answers "is this transaction dealt with?" — separately from whether
   * it produced an entitlement. A permanently rejected purchase is done (there
   * is nothing left to try) even though it granted nothing, while an offline
   * failure is NOT done and must be retried. Collapsing the two would either
   * resubmit a rejected transaction on every foreground forever, or drop a real
   * purchase on the floor because the network blinked.
   */
  const settle = useCallback(
    async (purchase: Purchase): Promise<SettleResult> => {
      // Ask to Buy / SCA. Apple has not charged anyone yet and there is nothing
      // to verify; the transaction arrives again once it is approved.
      if (purchase.purchaseState === 'pending') {
        settlePending({
          ok: false,
          error: new BillingError(
            'This purchase needs approval before it can be completed.',
            'unavailable',
          ),
        });
        return { done: false, entitlement: null };
      }

      const jws = purchase.purchaseToken;
      if (!jws) {
        // Typed nullable by expo-iap. Without the signed transaction there is
        // nothing the backend could verify, so don't finish it either.
        settlePending({
          ok: false,
          error: new BillingError('This purchase could not be read.', 'unavailable'),
        });
        // Nothing to verify and nothing to finish — but re-reading it every
        // foreground would not make a signature appear either.
        return { done: true, entitlement: null };
      }

      try {
        const token = await getToken();
        const next = await verifyPurchase(token, jws);

        // Verified and stored. Safe to tell Apple we're done with it.
        await finishTransaction({ purchase });

        if (alive.current) {
          setEntitlement(next);
          setStatus('ready');
        }
        settlePending({ ok: true, value: next });
        return { done: true, entitlement: next };
      } catch (err) {
        const terminal = err instanceof BillingError && err.terminal;
        if (terminal) {
          // Permanently not ours to honour. Finish it ANYWAY — otherwise
          // StoreKit re-delivers this transaction on every single launch and
          // the customer can never get past it.
          await finishTransaction({ purchase }).catch(() => {});
        }
        settlePending({ ok: false, error: err });
        return { done: terminal, entitlement: null };
      }
    },
    [finishTransaction, getToken, settlePending],
  );

  const refresh = useCallback(async () => {
    if (!userId) {
      setEntitlement(FREE_ENTITLEMENT);
      setStatus('ready');
      return;
    }
    try {
      const token = await getToken();
      const next = await fetchEntitlement(token);
      if (!alive.current) return;
      setEntitlement(next);
      setStatus('ready');
    } catch {
      if (!alive.current) return;
      // Falling back to Free is the safe read: it never grants access that
      // wasn't paid for. Note this is a DISPLAY fallback — the server is still
      // the authority, so a network blip can't actually unlock anything.
      setEntitlement(FREE_ENTITLEMENT);
      setStatus('error');
    }
  }, [getToken, userId]);

  /**
   * Re-sync with StoreKit: submit anything new, changed, or newly revoked.
   *
   * Covers the app being killed mid-purchase, a purchase made on another
   * device, a verify call whose response was lost — and, critically, REFUNDS.
   *
   * `onlyIncludeActiveItemsIOS` is false on purpose. A refunded or revoked
   * transaction is by definition not "currently active", so the active-only
   * view silently omits it: we would never learn the refund happened, never
   * record `revoked_at`, and keep serving paid features until the period ran
   * out on its own. Asking for the full history is the only way the client can
   * see a revocation, because the client's signed transaction carries no
   * renewal info and there is no notification endpoint yet.
   *
   * Re-fetches rather than persisting anything: `finishTransaction` needs the
   * whole purchase object, and useIAP strips the iOS-specific fields on the way
   * through, so a stored copy could not be used to finish anything.
   */
  const reconcile = useCallback(async () => {
    if (!userId || !connected) return;
    try {
      await getAvailablePurchases({ onlyIncludeActiveItemsIOS: false });
    } catch {
      // Nothing to do — the next foreground will try again.
    }
  }, [connected, getAvailablePurchases, userId]);

  // Load Apple's product metadata once connected.
  useEffect(() => {
    if (!connected) return;
    void fetchProducts({ skus: PRODUCT_IDS, type: 'subs' });
  }, [connected, fetchProducts]);

  // Introductory-offer eligibility is per SUBSCRIPTION GROUP, not per product:
  // spending the trial on Pro disqualifies Premium too. Asking Apple is the
  // only correct answer — assuming eligibility would advertise a trial the
  // customer won't get.
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void isEligibleForIntroOfferIOS(SUBSCRIPTION_GROUP_ID)
      .then((eligible) => {
        if (!cancelled) setIntroEligible(Boolean(eligible));
      })
      .catch(() => {
        if (!cancelled) setIntroEligible(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, entitlement.tier]);

  // Hydrate on sign-in; reset on sign-out so the next account never inherits
  // the previous one's tier.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void reconcile();
  }, [reconcile]);

  // Submit anything StoreKit hands back from a reconcile pass.
  //
  // The reconcile asks for the FULL history (so refunds are visible), which
  // grows by one transaction per renewal. Submitting all of it on every
  // foreground would be wasteful, so each is fingerprinted by the state we
  // actually care about — a transaction whose revocation or expiry has changed
  // looks new again and is resubmitted, while unchanged history is skipped.
  useEffect(() => {
    if (!availablePurchases?.length || !userId) return;
    void (async () => {
      for (const purchase of availablePurchases) {
        const p = purchase as Purchase & {
          revocationDateIOS?: number | null;
          expirationDateIOS?: number | null;
        };
        const fingerprint = [
          p.transactionId ?? p.id,
          p.revocationDateIOS ?? '',
          p.expirationDateIOS ?? '',
          p.purchaseState,
        ].join(':');

        if (settledRef.current.has(fingerprint)) continue;
        const { done } = await settle(purchase);
        // Only remember it once there is nothing left to do. A transaction that
        // failed to reach the backend must be retried on the next pass.
        if (done) settledRef.current.add(fingerprint);
      }
    })();
  }, [availablePurchases, settle, userId]);

  // Subscriptions change while the app is backgrounded — renewals, refunds,
  // cancellations. With no server-side notification endpoint yet, foreground is
  // when we find out.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
        void reconcile();
      }
    });
    return () => sub.remove();
  }, [refresh, reconcile]);

  const products = useMemo(() => {
    const index: Record<string, ProductSubscription> = {};
    for (const p of subscriptions ?? []) index[p.id] = p;
    return index;
  }, [subscriptions]);

  const purchase = useCallback(
    (productId: string) =>
      new Promise<Entitlement>((resolve, reject) => {
        if (!userId) {
          reject(new BillingError('Sign in to subscribe.', 'unavailable'));
          return;
        }
        if (!connected) {
          reject(new BillingError('The App Store is unavailable right now.', 'unavailable'));
          return;
        }
        if (!products[productId]) {
          reject(new BillingError('This plan is unavailable right now.', 'unavailable'));
          return;
        }

        // A second attempt while one is in flight would orphan the first
        // promise — its caller would await forever. Settle it first.
        settlePending({
          ok: false,
          error: new BillingError('Purchase superseded by a new attempt.', 'cancelled'),
        });

        // The escape hatch for a purchase that never comes back.
        //
        // This promise settles only when the transaction listener fires. If
        // StoreKit accepts requestPurchase but emits no transaction the listener
        // recognises — which is exactly what "You're already subscribed to this"
        // does — nothing ever settles it. The paywall then sits at
        // work.kind === 'working' forever, which disables its own Restore, Terms
        // and Privacy links, and the only way out is force-quitting the app.
        //
        // 90s because a legitimate purchase can genuinely take a while: Face ID,
        // password entry, Ask to Buy, a slow storefront. This is a backstop, not
        // a deadline.
        const timer = setTimeout(() => {
          settlePending({
            ok: false,
            error: new BillingError(
              "The App Store didn't respond. If you were charged, your plan will " +
                'activate shortly — try Restore.',
              'unknown',
            ),
          });
        }, 90_000);

        pending.current = { resolve, reject, timer };
        void requestPurchase({
          type: 'subs',
          request: {
            // Ties Apple's transaction to this GymSync account, which is what
            // lets the backend prove ownership later. StoreKit silently drops
            // a non-UUID value, so a malformed id must not reach it — a
            // transaction with no token is far harder to attribute.
            apple: { sku: productId, appAccountToken: userId },
          },
        }).catch((err) => {
          settlePending({ ok: false, error: err });
        });
      }),
    [connected, products, requestPurchase, settlePending, userId],
  );

  const restore = useCallback(async () => {
    if (!userId) throw new BillingError('Sign in to restore purchases.', 'unavailable');
    try {
      await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    } catch {
      throw new BillingError('Could not reach the App Store.', 'network');
    }
    // The availablePurchases effect submits whatever came back; re-reading the
    // server afterwards is what turns it into an answer.
    await refresh();
    const token = await getToken().catch(() => null);
    return token ? await fetchEntitlement(token) : FREE_ENTITLEMENT;
  }, [getAvailablePurchases, getToken, refresh, userId]);

  const manage = useCallback(async () => {
    // Apple's own sheet — cancellation, plan changes and payment methods are
    // Apple's to own, and App Review expects this to be reachable in-app.
    await deepLinkToSubscriptionsIOS();
  }, []);

  const value = useMemo<BillingContextValue>(
    () => ({
      connected,
      products,
      entitlement,
      status,
      introEligible,
      purchase,
      restore,
      refresh,
      manage,
    }),
    [
      connected,
      products,
      entitlement,
      status,
      introEligible,
      purchase,
      restore,
      refresh,
      manage,
    ],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error('useBilling must be used within BillingProvider');
  return ctx;
}

/**
 * The purchase seam — now real.
 *
 * Two halves that must not be confused:
 *
 *   StoreKit  decides what a purchase COSTS and takes the money.
 *   The backend decides what the customer is ENTITLED to.
 *
 * Nothing here ever infers a tier from a device-side callback. A completed
 * StoreKit purchase is not access; it is an Apple-signed claim that gets posted
 * to the backend, verified against Apple's certificate chain, stored, and
 * turned into an entitlement the server hands back. That is the whole point of
 * `verifyPurchase` below being the only way an Entitlement is produced.
 *
 * The StoreKit calls themselves live in BillingProvider, which owns the single
 * connection. This module is the HTTP half, matching the house style in
 * api/profile.ts: a private request helper, `token` as the first argument.
 */
import {
  SKU_BY_PRODUCT_ID,
  type BillingPeriod,
  type TierId,
} from '@/screens/pricing/catalog';
import { voiceConfig } from '@/voice/config';

export interface Entitlement {
  tier: TierId;
  /** null while on Free. */
  period: BillingPeriod | null;
  /**
   * ISO timestamp; null while on Free.
   *
   * Really "current period end". Whether that date is a renewal or an expiry
   * lives in Apple's renewal info, which a client-submitted transaction does
   * not carry — so no copy built on this may promise a renewal.
   */
  renewsAt: string | null;
  inTrial: boolean;
  /** The winning SKU, so the paywall can highlight what's owned. */
  productId?: string | null;
  /** True while this comes from the stub rather than a real store. */
  isStub: boolean;
}

export const FREE_ENTITLEMENT: Entitlement = {
  tier: 'free',
  period: null,
  renewsAt: null,
  inTrial: false,
  productId: null,
  isStub: false,
};

export type BillingErrorCode =
  | 'cancelled'
  | 'unavailable'
  | 'network'
  | 'already_linked'
  | 'invalid'
  | 'unknown';

export class BillingError extends Error {
  constructor(
    message: string,
    readonly code: BillingErrorCode,
    /**
     * True when retrying can never help — the purchase is permanently not ours
     * to honour. The caller MUST still finish the StoreKit transaction in this
     * case, or Apple replays it on every launch forever and the app wedges.
     */
    readonly terminal = false,
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

/** Which SKU a product id names. Re-exported so callers don't reach into the catalog. */
export function skuFor(productId: string) {
  return SKU_BY_PRODUCT_ID[productId] ?? null;
}

interface EntitlementPayload {
  tier: TierId;
  period: BillingPeriod | null;
  renewsAt: string | null;
  inTrial: boolean;
  productId: string | null;
}

function toEntitlement(payload: EntitlementPayload): Entitlement {
  return {
    tier: payload.tier ?? 'free',
    period: payload.period ?? null,
    renewsAt: payload.renewsAt ?? null,
    inTrial: Boolean(payload.inTrial),
    productId: payload.productId ?? null,
    isStub: false,
  };
}

async function request<T>(
  token: string,
  path: string,
  init?: { method?: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${voiceConfig.apiBaseUrl}/api/billing${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : null),
    });
  } catch {
    // Offline. Emphatically NOT terminal: the purchase may well have gone
    // through on Apple's side, and the reconcile pass will submit it again.
    throw new BillingError('Could not reach GymSync. Check your connection.', 'network');
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const message: string =
      detail?.detail?.message ?? 'Something went wrong. Try again.';

    // 409 — this Apple subscription belongs to another GymSync account.
    // Terminal by definition: no amount of retrying makes it ours.
    if (res.status === 409) {
      throw new BillingError(message, 'already_linked', true);
    }
    // 422 — verified but unusable (unknown product, wrong app, bad signature).
    // Also terminal; retrying re-submits the same bytes.
    //
    // Note what is NOT here: an environment mismatch. That is a server
    // misconfiguration, and the server reports it as 503 precisely so it lands
    // in the retryable branch below — treating it as terminal would finish and
    // discard a genuine purchase over a wrong config line.
    if (res.status === 422) {
      throw new BillingError(message, 'invalid', true);
    }
    // Everything else — 5xx, timeouts, unknown — is retryable. The transaction
    // stays unfinished and the next reconcile submits it again.
    throw new BillingError(message, res.status >= 500 ? 'network' : 'unknown');
  }

  return (await res.json()) as T;
}

/**
 * What the user is entitled to right now, according to the server.
 *
 * The only source of truth. Called on sign-in, on foreground, and after every
 * purchase or restore.
 */
export async function fetchEntitlement(token: string): Promise<Entitlement> {
  return toEntitlement(await request<EntitlementPayload>(token, '/entitlement'));
}

/**
 * Submit one Apple-signed transaction and receive the resulting entitlement.
 *
 * A 2xx here is what authorizes `finishTransaction` on the StoreKit side —
 * finishing before this succeeds would discard the only durable record that the
 * purchase happened.
 *
 * The returned entitlement is applied directly rather than triggering a re-read:
 * a second round trip is a second chance to fail, and that failure would show
 * "Free" one second after the customer paid.
 */
export async function verifyPurchase(token: string, jws: string): Promise<Entitlement> {
  return toEntitlement(
    await request<EntitlementPayload>(token, '/apple/verify', {
      method: 'POST',
      body: { jws },
    }),
  );
}

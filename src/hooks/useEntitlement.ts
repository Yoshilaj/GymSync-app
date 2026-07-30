/**
 * The current subscription entitlement, as a hook.
 *
 * Now a thin read of BillingContext, exactly as this file's earlier note
 * predicted it would become once a real store landed. Keeping the hook's shape
 * ({ entitlement, status, refresh }) meant its two consumers — PricingScreen
 * and SettingsHomeScreen — needed no edit at all.
 *
 * It has to be a shared context rather than per-mount state: a purchase made on
 * the paywall must be visible to Settings without a refetch, and every mount
 * owning its own copy would also mean several StoreKit connections.
 */
import { useBilling } from '@/billing/BillingProvider';
import type { Entitlement } from '@/api/billing';

export type EntitlementStatus = 'loading' | 'ready' | 'error';

export function useEntitlement(): {
  entitlement: Entitlement;
  status: EntitlementStatus;
  refresh: () => Promise<void>;
} {
  const { entitlement, status, refresh } = useBilling();
  return { entitlement, status, refresh };
}

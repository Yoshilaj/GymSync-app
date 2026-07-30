/**
 * "You need to upgrade for this" — one shape, however it arrives.
 *
 * The server refuses a paid feature in two different transports: an HTTP 403
 * with a structured `detail` (plan generation, personality), and an
 * `upgrade_required` frame on the voice WebSocket (voice sessions, chat
 * messages). Both carry the same facts, so both parse into this.
 *
 * Having one shape is what lets every call site do the same thing — open the
 * paywall on the tier that actually helps — instead of each inventing its own
 * error string.
 */
import type { PaidTierId, TierId } from '@/screens/pricing/catalog';

export type UpgradeCode = 'upgrade_required' | 'quota_exhausted';

export interface UpgradeRequired {
  code: UpgradeCode;
  /** Which capability was refused, e.g. "voice_session". */
  feature: string;
  currentTier: TierId;
  /** The tier to send them to — already "the next one up" for a spent quota. */
  requiredTier: PaidTierId;
  message: string;
  /** Present for a spent allowance, absent for a feature they never had. */
  limit?: number;
  used?: number;
  /** ISO timestamp, or null for a lifetime allowance that never comes back. */
  resetsAt?: string | null;
}

const TIERS = new Set<string>(['free', 'pro', 'premium']);

/**
 * Read an upgrade refusal out of an arbitrary payload.
 *
 * Returns null for anything that isn't one, so callers can use it as the "is
 * this an upgrade prompt or a real error?" test in a single branch.
 */
export function parseUpgrade(payload: unknown): UpgradeRequired | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;

  const code = raw.code;
  if (code !== 'upgrade_required' && code !== 'quota_exhausted') return null;

  const currentTier = TIERS.has(String(raw.current_tier))
    ? (raw.current_tier as TierId)
    : 'free';
  const requiredTier =
    raw.required_tier === 'premium' ? 'premium' : ('pro' as PaidTierId);

  return {
    code,
    feature: typeof raw.feature === 'string' ? raw.feature : 'unknown',
    currentTier,
    requiredTier,
    message:
      typeof raw.message === 'string' && raw.message
        ? raw.message
        : 'Upgrade to use this feature.',
    limit: typeof raw.limit === 'number' ? raw.limit : undefined,
    used: typeof raw.used === 'number' ? raw.used : undefined,
    resetsAt: typeof raw.resets_at === 'string' ? raw.resets_at : null,
  };
}

/**
 * An upgrade refusal raised as an error, for the HTTP paths.
 *
 * The WebSocket paths don't throw — they receive a frame and handle it inline.
 */
export class UpgradeRequiredError extends Error {
  constructor(readonly upgrade: UpgradeRequired) {
    super(upgrade.message);
    this.name = 'UpgradeRequiredError';
  }
}

export function isUpgradeError(e: unknown): e is UpgradeRequiredError {
  return e instanceof UpgradeRequiredError;
}

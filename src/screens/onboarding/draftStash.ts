/**
 * The onboarding draft's ride across the auth boundary.
 *
 * Onboarding now runs before an account exists, but the profile PUT needs a
 * token — so the finished draft waits here (AsyncStorage) until a session
 * appears. That gap can be seconds (instant signup) or days with an app
 * upgrade in between (email confirmation), hence the version stamp: a draft
 * whose shape this build no longer understands is discarded, and the user
 * simply gets the post-auth question flow instead of a crash.
 *
 * Nothing in this module decides WHEN the stash is cleared — that lives in
 * UserContext, keyed on `onboarded_at` arriving, so a crash between the
 * draft PUT and onboarding completion can always resume.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OnboardingDraft } from './OnboardingContext';

export const DRAFT_STASH_KEY = '@gymsync/onboarding-draft';

/** Bump when OnboardingDraft changes shape incompatibly. */
const STASH_VERSION = 1;

/** Drafts older than this are discarded on read — bounds the weirdness of a
 *  stale draft resurfacing on someone else's later sign-in. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface Stash {
  version: number;
  savedAt: number;
  draft: OnboardingDraft;
}

/** Persist a completed pre-auth draft. Returns false instead of throwing —
 *  a storage failure must never block account creation. */
export async function stashPendingDraft(draft: OnboardingDraft): Promise<boolean> {
  try {
    const stash: Stash = { version: STASH_VERSION, savedAt: Date.now(), draft };
    await AsyncStorage.setItem(DRAFT_STASH_KEY, JSON.stringify(stash));
    return true;
  } catch {
    return false;
  }
}

/** Read-and-validate. Anything unusable (parse failure, version mismatch,
 *  expired) is treated as absent and cleaned up. */
export async function readPendingDraft(): Promise<OnboardingDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_STASH_KEY);
    if (!raw) return null;
    const stash = JSON.parse(raw) as Partial<Stash>;
    const valid =
      stash.version === STASH_VERSION &&
      typeof stash.savedAt === 'number' &&
      Date.now() - stash.savedAt < MAX_AGE_MS &&
      !!stash.draft &&
      Array.isArray(stash.draft.goals);
    if (!valid) {
      void AsyncStorage.removeItem(DRAFT_STASH_KEY);
      return null;
    }
    return stash.draft as OnboardingDraft;
  } catch {
    return null;
  }
}

export function clearPendingDraft(): Promise<void> {
  return AsyncStorage.removeItem(DRAFT_STASH_KEY).catch(() => undefined);
}

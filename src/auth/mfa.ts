/**
 * Two-factor authentication (TOTP — authenticator apps, no SMS).
 *
 * WHY THIS ONE IS CLIENT-SIDE. Every other auth flow routes through /api/auth/* so
 * the backend stays the single auth surface. Enroll/challenge/verify can't: they
 * need a GoTrue client carrying the *user's own* session, and the backend's client
 * is stateless and anon-keyed (backend/app/routers/auth.py). Doing it server-side
 * would mean constructing a per-request client and calling set_session on it —
 * strictly worse than letting supabase-js, which already holds the session, do it.
 *
 * The server still gets the final say on enforcement: after any change here, tell
 * it via /api/auth/mfa/state, which re-reads the factor list itself rather than
 * believing us.
 */
import type { Factor } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { syncMfaState } from '@/api/auth';

/** Shown in the authenticator app's list. */
const FRIENDLY_NAME = 'GymSync';

/** Discriminated on `ok` rather than on the presence of `error`, so narrowing
 * actually works at the call site. */
export type EnrollmentStart =
  | {
      ok: true;
      factorId: string;
      /** SVG data URI — react-native-svg renders it directly, no QR library needed. */
      qrCode: string;
      /** The same secret, for typing in by hand when the camera isn't an option. */
      secret: string;
    }
  | { ok: false; error: string };

/** Is a second factor set up, and has this session cleared it? */
export async function getMfaStatus(): Promise<{
  enrolled: boolean;
  /** True when a factor exists but this session is still only aal1. */
  challengeRequired: boolean;
}> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { enrolled: false, challengeRequired: false };
  const enrolled = data.nextLevel === 'aal2';
  return {
    enrolled,
    challengeRequired: enrolled && data.currentLevel === 'aal1',
  };
}

export async function listVerifiedFactors(): Promise<Factor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return [];
  return (data.totp ?? []).filter((f) => f.status === 'verified');
}

/**
 * Begin enrollment. The factor exists but is UNVERIFIED until a code is confirmed,
 * so nothing is enforced yet — abandoning here leaves the account exactly as it was,
 * apart from a stray unverified factor that `cancelEnrollment` cleans up.
 */
export async function startEnrollment(): Promise<EnrollmentStart> {
  // An abandoned enrollment leaves an unverified factor behind, and Supabase
  // rejects a second one with the same friendly name. Clear those first, or a
  // user who backed out once can never enroll again.
  await clearUnverifiedFactors();

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: FRIENDLY_NAME,
  });
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not start setup.' };
  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/** Confirm the six-digit code. On success the session is upgraded to aal2. */
export async function confirmEnrollment(
  factorId: string,
  code: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: friendlyCodeError(error.message) };
  // Only now is a factor verified, so only now does the server start requiring one.
  await syncStateWithServer();
  return { error: null };
}

/** Answer the challenge at sign-in. Upgrades the current session to aal2. */
export async function verifyChallenge(code: string): Promise<{ error: string | null }> {
  const factors = await listVerifiedFactors();
  const factorId = factors[0]?.id;
  if (!factorId) return { error: 'No authenticator is set up on this account.' };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  return { error: error ? friendlyCodeError(error.message) : null };
}

/** Turn 2FA off. Requires a valid code first — see TwoFactorScreen. */
export async function disableMfa(): Promise<{ error: string | null }> {
  const factors = await listVerifiedFactors();
  for (const factor of factors) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) return { error: error.message };
  }
  await syncStateWithServer();
  return { error: null };
}

async function clearUnverifiedFactors(): Promise<void> {
  const { data } = await supabase.auth.mfa.listFactors();
  for (const factor of data?.totp ?? []) {
    if (factor.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
}

/** Best effort: the factor list is the authority, so a failed sync self-heals on
 * the next call. Never block the user on it. */
async function syncStateWithServer(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) await syncMfaState(token);
  } catch {
    // Deliberately swallowed — see above.
  }
}

function friendlyCodeError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid') || lower.includes('expired')) {
    return "That code didn't work. Codes change every 30 seconds — try the current one.";
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  return message;
}

/**
 * Parsing for the links Supabase emails out.
 *
 * Every one of them (confirm signup, reset password, confirm email change) bounces
 * through `/auth/v1/verify` and lands on `gymsync://auth-callback`. What arrives is
 * NOT the same in each case, and the old handler ignored all of it — it matched the
 * prefix and popped a generic "Confirmed" alert, which meant a password reset had
 * nowhere to go and an expired link looked identical to a successful one.
 *
 * Verified against the live project: a recovery link redirects with the tokens in
 * the URL **fragment** —
 *   gymsync://auth-callback#access_token=…&refresh_token=…&type=recovery
 * and a dead link redirects with
 *   gymsync://auth-callback#error=access_denied&error_code=otp_expired&…
 *
 * Params are read from both the fragment and the query string because GoTrue has
 * used both across versions and flow types, and reading one costs nothing.
 */

export const AUTH_CALLBACK_PREFIX = 'gymsync://auth-callback';

export type AuthCallback =
  /** A password-reset link. Carries a live session scoped to setting a new password. */
  | { kind: 'recovery'; accessToken: string; refreshToken: string }
  /** Signup or email-change confirmation — already applied server-side. */
  | { kind: 'confirmed'; type: string }
  /** The link was expired, already used, or refused. */
  | { kind: 'error'; code: string | null; message: string };

/** Human wording for the error codes GoTrue actually returns on these links. */
function describe(code: string | null, raw: string | null): string {
  switch (code) {
    case 'otp_expired':
      return 'That link has expired. Request a new one and try again.';
    case 'access_denied':
      return 'That link is no longer valid. It may have already been used.';
    default:
      // GoTrue percent-encodes and '+'-encodes its description; make it readable.
      return raw?.replace(/\+/g, ' ') || 'That link could not be used. Request a new one.';
  }
}

function collectParams(url: string): URLSearchParams {
  const merged = new URLSearchParams();
  const afterScheme = url.slice(AUTH_CALLBACK_PREFIX.length);
  const hashAt = afterScheme.indexOf('#');
  const query = hashAt === -1 ? afterScheme : afterScheme.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : afterScheme.slice(hashAt + 1);

  for (const chunk of [query.replace(/^\?/, ''), fragment]) {
    if (!chunk) continue;
    for (const [k, v] of new URLSearchParams(chunk)) merged.set(k, v);
  }
  return merged;
}

/** Returns null when the URL isn't one of ours. */
export function parseAuthCallback(url: string | null): AuthCallback | null {
  if (!url || !url.startsWith(AUTH_CALLBACK_PREFIX)) return null;

  const params = collectParams(url);

  const error = params.get('error') ?? params.get('error_code');
  if (error) {
    const code = params.get('error_code') ?? params.get('error');
    return { kind: 'error', code, message: describe(code, params.get('error_description')) };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');

  // Only recovery gets to take over the UI. A signup/email-change link may also
  // carry tokens, but that change is already applied — hijacking the app into a
  // password form for it would be wrong.
  if (type === 'recovery' && accessToken && refreshToken) {
    return { kind: 'recovery', accessToken, refreshToken };
  }

  return { kind: 'confirmed', type: type ?? 'unknown' };
}

/** What to tell the user after a non-recovery link resolves. */
export function confirmationMessage(type: string): string {
  switch (type) {
    case 'signup':
      return 'Your email is confirmed. You can sign in now.';
    case 'email_change':
      return 'Your new email address is confirmed.';
    default:
      return 'Your change has been confirmed.';
  }
}

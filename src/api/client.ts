/**
 * The one place an authenticated request to our backend is made.
 *
 * Before this existed, each of the eight API modules hand-rolled its own
 * `Authorization: Bearer ${token}` and its own `if (!res.ok) throw`. Nothing
 * anywhere handled a 401. An expired or revoked session surfaced as
 * "Profile GET failed (HTTP 401)" on whatever screen happened to ask first, and
 * the app stayed in its signed-in state forever, retrying with a dead token.
 *
 * Three things happen here that used not to happen at all:
 *
 *   401 → refresh once, retry, and only then give up. Tokens are short-lived by
 *         design (the TTL was lowered deliberately, see backend/app/jwt_verify.py),
 *         so a request landing just after expiry is expected, not exceptional.
 *   Repeated 401 → sign out cleanly, so the app returns to the sign-in screen
 *         instead of sitting in a broken authenticated state.
 *   403 + X-MFA-Required → surfaced as its own error, because "finish signing in"
 *         is not the same as "you may not do that".
 *
 * The backend's error `detail` is used when it's a string — those are written for
 * people (see backend/app/routers/auth.py) and are better than any generic message
 * that could be composed here.
 */
import { supabase } from '@/auth/supabase';
import { voiceConfig } from '@/voice/config';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The session is gone and the app has been signed out. */
    readonly signedOut = false,
    /** A second factor is owed before this will succeed. */
    readonly mfaRequired = false,
    /**
     * The raw `detail` from the response. Some endpoints answer with a structured
     * body rather than a sentence — an entitlement refusal carries the tier and
     * quota the paywall needs (see billing/upgrade.ts) — and flattening that to a
     * string here would throw the information away.
     */
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

/** Pulled out so a caller can tell "the network is down" from "the server said no". */
const OFFLINE = "Can't reach the server. Check your connection.";

async function readError(
  res: Response,
  fallback: string,
): Promise<{ message: string; detail: unknown }> {
  try {
    const data = await res.json();
    const detail = data?.detail;
    // FastAPI nests validation errors as an array; ours are plain strings.
    return { message: typeof detail === 'string' ? detail : fallback, detail };
  } catch {
    return { message: fallback, detail: undefined };
  }
}

/**
 * Artificial latency on every authed request, so loading skeletons are actually
 * observable against a fast local backend. Every screen's loading state is
 * invisible otherwise: the fetch resolves before a frame is drawn.
 *
 * 0 = off, which is the committed state. Set it while working on a loading state,
 * put it back afterwards. Doubly guarded by `__DEV__` so it can never reach a
 * release build even if it's left switched on.
 */
const DEBUG_LATENCY_MS = 0;

/**
 * `token` is the caller's current access token. On a 401 we refresh and retry with
 * a new one, so callers don't need to thread refresh logic through their own code —
 * they pass what they have and get an answer.
 */
export async function authedFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  if (__DEV__ && DEBUG_LATENCY_MS > 0) {
    await new Promise((r) => setTimeout(r, DEBUG_LATENCY_MS));
  }

  const url = `${voiceConfig.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const send = (bearer: string) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : null),
        ...init.headers,
        Authorization: `Bearer ${bearer}`,
      },
    });

  let res: Response;
  try {
    res = await send(token);
  } catch {
    throw new ApiError(OFFLINE, 0);
  }

  if (res.status === 401) {
    // One refresh, one retry. Looping here would hammer a genuinely dead session.
    const { data, error } = await supabase.auth.refreshSession();
    const refreshed = data?.session?.access_token;
    if (!error && refreshed) {
      try {
        res = await send(refreshed);
      } catch {
        throw new ApiError(OFFLINE, 0);
      }
    }
    if (res.status === 401) {
      // The session really is finished. Sign out so the gate returns the user to
      // the sign-in screen rather than leaving them in a signed-in shell where
      // every request fails.
      await supabase.auth.signOut();
      throw new ApiError('Your session expired. Please sign in again.', 401, true);
    }
  }

  if (res.status === 403 && res.headers.get('X-MFA-Required') === '1') {
    const { message, detail } = await readError(res, 'Two-factor authentication required.');
    throw new ApiError(message, 403, false, true, detail);
  }

  if (!res.ok) {
    // 503 is our own doing (see backend/app/auth.py) — say so, rather than
    // implying the user did something wrong.
    const fallback =
      res.status >= 500
        ? 'Something went wrong on our end. Please try again.'
        : 'Something went wrong. Please try again.';
    const { message, detail } = await readError(res, fallback);
    throw new ApiError(message, res.status, false, false, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Convenience wrappers — the shapes the API modules actually use. */
export const api = {
  get: <T>(path: string, token: string) => authedFetch<T>(path, token),
  post: <T>(path: string, token: string, body?: unknown) =>
    authedFetch<T>(path, token, {
      method: 'POST',
      ...(body !== undefined ? { body: JSON.stringify(body) } : null),
    }),
  put: <T>(path: string, token: string, body?: unknown) =>
    authedFetch<T>(path, token, {
      method: 'PUT',
      ...(body !== undefined ? { body: JSON.stringify(body) } : null),
    }),
  del: <T>(path: string, token: string, body?: unknown) =>
    authedFetch<T>(path, token, {
      method: 'DELETE',
      ...(body !== undefined ? { body: JSON.stringify(body) } : null),
    }),
};

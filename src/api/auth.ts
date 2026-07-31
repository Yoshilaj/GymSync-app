import { voiceConfig } from '@/voice/config';

/** Tokens minted by the backend's Supabase proxy — fed to supabase.auth.setSession. */
export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number | null;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface SignupResponse {
  user: AuthUser;
  /** Null when Supabase requires email confirmation before first login. */
  session: AuthSession | null;
  email_confirmation_required: boolean;
}

export interface LoginResponse {
  user: AuthUser;
  session: AuthSession;
}

/** Thrown for non-OK responses, carrying the backend's user-facing `detail`. */
export class AuthApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function post<T>(path: string, body: object, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${voiceConfig.apiBaseUrl}/api/auth/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthApiError("Can't reach the server. Check your connection.", 0);
  }
  if (!res.ok) {
    let detail = 'Something went wrong. Please try again.';
    try {
      const data = await res.json();
      // FastAPI validation errors nest detail as an array; ours are strings.
      if (typeof data.detail === 'string') detail = data.detail;
    } catch {
      // keep the generic message
    }
    throw new AuthApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

export function signup(
  email: string,
  password: string,
  displayName?: string,
): Promise<SignupResponse> {
  return post('signup', { email, password, display_name: displayName ?? null });
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return post('login', { email, password });
}

export function requestPasswordReset(email: string): Promise<{ ok: boolean }> {
  return post('reset-password', { email });
}

/** Change the password of a signed-in user. The server re-checks `currentPassword`
 * and applies the same rules sign-up does — neither happens on the client. */
export function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return post('change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  }, token);
}

/** Finish a reset. `token` must be the recovery session from the email link — the
 * server refuses an ordinary password session here. */
export function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return post('reset-password/confirm', { new_password: newPassword }, token);
}

/** Tell the server the account's MFA factors changed. It re-reads them itself —
 * this call carries no claim about what the new state is. */
export function syncMfaState(token: string): Promise<{ mfa_enabled: boolean }> {
  return post('mfa/state', {}, token);
}

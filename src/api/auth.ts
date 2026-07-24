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

async function post<T>(path: string, body: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${voiceConfig.apiBaseUrl}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { Alert, AppState, Linking } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import * as authApi from '@/api/auth';
import { supabase } from './supabase';
import { confirmationMessage, parseAuthCallback } from './deepLinks';
import { getMfaStatus, verifyChallenge } from './mfa';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been loaded on startup. */
  loading: boolean;
  /**
   * A password-reset link was opened and its session is live. The app must show
   * the "set a new password" screen and nothing else — a recovery session is a
   * real session, so without this gate the user would land straight in the app
   * with their old password still working.
   */
  recoveryMode: boolean;
  /**
   * The account has a second factor and this session hasn't cleared it yet.
   * A session exists at this point — it's just aal1 — so the gate has to stop
   * on this before any branch that would show the app.
   */
  twoFactorPending: boolean;
  /** Answer the 2FA challenge. Success upgrades the session to aal2. */
  submitTwoFactor: (code: string) => Promise<{ error: string | null }>;
  /** Re-read whether this session still needs a factor (after enrolling, say). */
  refreshTwoFactor: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  /** Set a new password using the live recovery session, then leave recovery mode. */
  completeRecovery: (newPassword: string) => Promise<{ error: string | null }>;
  /** Abandon a reset without setting a password. Signs the recovery session out. */
  cancelRecovery: () => Promise<void>;
  signOut: () => Promise<void>;
  /** A fresh Supabase JWT for the backend. Throws if not authenticated. */
  getToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [twoFactorPending, setTwoFactorPending] = useState(false);

  useEffect(() => {
    // Load any persisted session, then subscribe to changes.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // Belt and braces: supabase-js raises this itself when it recognises a
      // recovery session. On native we normally get there first, via the deep
      // link below, but a duplicate signal is harmless — the flag is idempotent.
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });

    // Keep tokens fresh while the app is foregrounded (Supabase's recommendation).
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      sub.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  // Whether this session still owes a second factor. Recomputed whenever the token
  // changes — which includes the moment a successful verify swaps an aal1 session
  // for an aal2 one. `mfaChecked` folds into `loading` below: the gate must not get
  // to choose a branch before this is known, or a 2FA account flashes the app for
  // a frame on every cold start.
  const [mfaChecked, setMfaChecked] = useState(false);
  const accessToken = session?.access_token ?? null;
  useEffect(() => {
    if (!accessToken) {
      setTwoFactorPending(false);
      setMfaChecked(true);
      return;
    }
    let cancelled = false;
    void getMfaStatus().then(({ challengeRequired }) => {
      if (cancelled) return;
      setTwoFactorPending(challengeRequired);
      setMfaChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // Emailed links (reset, signup confirm, email change) all land on
  // gymsync://auth-callback. Handled here rather than in a screen because a
  // recovery link has to change what the whole app is showing.
  useEffect(() => {
    let cancelled = false;

    const handle = async (url: string | null) => {
      const callback = parseAuthCallback(url);
      if (!callback || cancelled) return;

      if (callback.kind === 'error') {
        Alert.alert('Link expired', callback.message);
        return;
      }
      if (callback.kind === 'confirmed') {
        Alert.alert('Confirmed', confirmationMessage(callback.type));
        return;
      }

      // Recovery: adopt the session, then take over the UI. Order matters — the
      // flag goes up FIRST, because setSession fires onAuthStateChange and the
      // gate would otherwise render the app for a frame before flipping.
      setRecoveryMode(true);
      const { error } = await supabase.auth.setSession({
        access_token: callback.accessToken,
        refresh_token: callback.refreshToken,
      });
      if (error && !cancelled) {
        setRecoveryMode(false);
        Alert.alert('Link expired', 'That reset link is no longer valid. Request a new one.');
      }
    };

    const sub = Linking.addEventListener('url', (e) => void handle(e.url));
    void Linking.getInitialURL().then(handle);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // All auth flows go through the backend (/api/auth/*) so it stays the single
  // auth surface; supabase-js then owns the returned session (persistence +
  // auto-refresh) via setSession, which flips the RootGate through onAuthStateChange.
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { session: s } = await authApi.login(email, password);
      const { error } = await supabase.auth.setSession({
        access_token: s.access_token,
        refresh_token: s.refresh_token,
      });
      return { error: error?.message ?? null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Sign-in failed.' };
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      try {
        const res = await authApi.signup(email, password, displayName);
        if (res.session) {
          const { error } = await supabase.auth.setSession({
            access_token: res.session.access_token,
            refresh_token: res.session.refresh_token,
          });
          return { error: error?.message ?? null };
        }
        return { error: null, needsConfirmation: res.email_confirmation_required };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Sign-up failed.' };
      }
    },
    [],
  );

  const resetPassword = useCallback(async (email: string) => {
    try {
      await authApi.requestPasswordReset(email);
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Request failed.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    setRecoveryMode(false);
    setTwoFactorPending(false);
    await supabase.auth.signOut();
  }, []);

  const submitTwoFactor = useCallback(async (code: string) => {
    const result = await verifyChallenge(code);
    // A successful verify mints a fresh aal2 session, so onAuthStateChange fires
    // and the effect above recomputes anyway. Clearing here as well just avoids a
    // frame of the challenge screen sitting there after it's been answered.
    if (!result.error) setTwoFactorPending(false);
    return result;
  }, []);

  const refreshTwoFactor = useCallback(async () => {
    const { challengeRequired } = await getMfaStatus();
    setTwoFactorPending(challengeRequired);
  }, []);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Not authenticated');
    return token;
  }, []);

  const completeRecovery = useCallback(
    async (newPassword: string) => {
      try {
        const token = await getToken();
        // Via the backend, not supabase.auth.updateUser: the server owns the
        // password rules and checks that this really is a recovery session.
        await authApi.confirmPasswordReset(token, newPassword);
        // Drop the recovery session rather than continuing into the app on it.
        // Signing in with the new password is the honest confirmation that it took.
        setRecoveryMode(false);
        await supabase.auth.signOut();
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Could not set your password.' };
      }
    },
    [getToken],
  );

  const cancelRecovery = useCallback(async () => {
    setRecoveryMode(false);
    await supabase.auth.signOut();
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    // Not done loading until we also know whether a second factor is owed.
    loading: loading || !mfaChecked,
    recoveryMode,
    twoFactorPending,
    submitTwoFactor,
    refreshTwoFactor,
    signIn,
    signUp,
    resetPassword,
    completeRecovery,
    cancelRecovery,
    signOut,
    getToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import * as authApi from '@/api/auth';
import { supabase } from './supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been loaded on startup. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** A fresh Supabase JWT for the backend. Throws if not authenticated. */
  getToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load any persisted session, then subscribe to changes.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
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
    await supabase.auth.signOut();
  }, []);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Not authenticated');
    return token;
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    signIn,
    signUp,
    resetPassword,
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

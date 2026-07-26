import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, CoachPersonality, Units } from '@/types';
import { mockUser } from '@/data/mockUser';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchProfile,
  updateProfile,
  type ServerProfile,
} from '@/api/profile';

const PREFS_KEY = '@gymsync/prefs';
const PROFILE_KEY = '@gymsync/profile';

export type ProfileStatus = 'loading' | 'ready' | 'error';

interface UserContextValue {
  user: UserProfile;
  setPersonality: (p: CoachPersonality) => void;
  setUnits: (u: Units) => void;
  setDisplayName: (n: string) => void;
  toggleWorkoutNotifications: () => void;
  /** Server profile (onboarding data). Null until first fetch/cache. */
  profile: ServerProfile | null;
  profileStatus: ProfileStatus;
  refreshProfile: () => Promise<void>;
  /** PUT a partial update; optimistic merge, server response wins. */
  saveProfile: (
    patch: Partial<ServerProfile> & { complete_onboarding?: boolean },
  ) => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile>(mockUser);
  const hydratedRef = useRef(false);
  const hadSessionRef = useRef(false);
  const { session, getToken, loading: authLoading } = useAuth();
  const accountId = session?.user?.id ?? null;

  const [profile, setProfile] = useState<ServerProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('loading');

  // Restore locally-persisted preferences. Two hardening rules:
  // 1. Caches are per-account (`owner` field) — a previous account's data must
  //    never bleed into a fresh sign-in.
  // 2. The overlay only applies LOCAL-ONLY fields (personality, notifications).
  //    displayName/units are server-owned via the profile and must not be
  //    clobbered by a stale local copy racing the profile fetch.
  useEffect(() => {
    if (!accountId) return;
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw) as Partial<UserProfile> & { owner?: string };
          if (saved.owner && saved.owner !== accountId) {
            // Different account — drop the stale caches entirely.
            void AsyncStorage.multiRemove([PREFS_KEY, PROFILE_KEY]);
            return;
          }
          setUser((prev) => ({
            ...prev,
            ...(saved.coachPersonality
              ? { coachPersonality: saved.coachPersonality }
              : null),
            ...(saved.notificationsWorkout != null
              ? { notificationsWorkout: saved.notificationsWorkout }
              : null),
          }));
        }
      })
      .catch(() => {
        /* corrupt or missing prefs — fall back to defaults */
      })
      .finally(() => {
        hydratedRef.current = true;
      });
  }, [accountId]);

  useEffect(() => {
    if (!hydratedRef.current || !accountId) return;
    AsyncStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ ...user, owner: accountId }),
    ).catch(() => {
      /* best-effort persistence */
    });
  }, [user, accountId]);

  // Server wins for the fields it owns, once it has them.
  const absorbProfile = useCallback((p: ServerProfile) => {
    setProfile(p);
    setProfileStatus('ready');
    AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p)).catch(() => {});
    setUser((prev) => ({
      ...prev,
      ...(p.display_name ? { displayName: p.display_name } : null),
      ...(p.units ? { units: p.units } : null),
    }));
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetchProfile(token);
      absorbProfile(res.profile);
    } catch {
      // Offline / server down: serve the cached profile if we have one;
      // otherwise surface error so the gate can fail-open.
      const cached = await AsyncStorage.getItem(PROFILE_KEY).catch(() => null);
      if (cached) {
        setProfile(JSON.parse(cached) as ServerProfile);
        setProfileStatus('ready');
      } else {
        setProfileStatus('error');
      }
    }
  }, [getToken, absorbProfile]);

  // Hydrate whenever a session appears (login, cold start with session).
  // On a REAL sign-out (had a session, now gone — not the initial auth-loading
  // null), clear both caches so the next account starts clean.
  useEffect(() => {
    if (!session) {
      setProfile(null);
      setProfileStatus('loading');
      if (hadSessionRef.current && !authLoading) {
        hadSessionRef.current = false;
        setUser(mockUser);
        void AsyncStorage.multiRemove([PREFS_KEY, PROFILE_KEY]);
      }
      return;
    }
    hadSessionRef.current = true;
    setProfileStatus('loading');
    void refreshProfile();
  }, [session, authLoading, refreshProfile]);

  const saveProfile = useCallback(
    async (patch: Partial<ServerProfile> & { complete_onboarding?: boolean }) => {
      const token = await getToken();
      const res = await updateProfile(token, patch);
      absorbProfile(res.profile);
    },
    [getToken, absorbProfile],
  );

  const value: UserContextValue = {
    user,
    setPersonality: (coachPersonality) =>
      setUser((prev) => ({ ...prev, coachPersonality })),
    setUnits: (units) => setUser((prev) => ({ ...prev, units })),
    setDisplayName: (displayName) =>
      setUser((prev) => ({ ...prev, displayName })),
    toggleWorkoutNotifications: () =>
      setUser((prev) => ({
        ...prev,
        notificationsWorkout: !prev.notificationsWorkout,
      })),
    profile,
    profileStatus,
    refreshProfile,
    saveProfile,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}

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
import { defaultUser } from '@/data/defaultUser';
import {
  PLAN_KEY,
  PROGRESS_BODYWEIGHT_KEY,
  PROGRESS_SUMMARY_KEY,
} from '@/lib/storageKeys';
import { clearActiveWorkout } from '@/lib/activeWorkout';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchProfile,
  updateProfile,
  type ServerProfile,
} from '@/api/profile';
import {
  DRAFT_STASH_KEY,
  clearPendingDraft,
} from '@/screens/onboarding/draftStash';

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
  const [user, setUser] = useState<UserProfile>(defaultUser);
  const hydratedRef = useRef(false);
  const hadSessionRef = useRef(false);
  const { session, getToken, loading: authLoading } = useAuth();
  const accountId = session?.user?.id ?? null;
  // absorbProfile needs the account id to owner-stamp the cache, but taking it
  // as a dependency would re-create the callback (and re-fire the refresh
  // effect) on every token refresh. A ref sidesteps that.
  const accountIdRef = useRef(accountId);
  accountIdRef.current = accountId;

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
            void AsyncStorage.multiRemove([
          PREFS_KEY,
          PROFILE_KEY,
          PLAN_KEY,
          PROGRESS_SUMMARY_KEY,
          PROGRESS_BODYWEIGHT_KEY,
          DRAFT_STASH_KEY,
        ]);
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
            // Units are server-owned, but this cache is the SAME account's
            // last-known value and the profile fetch/cache overwrite it the
            // moment they land. Without it, an offline launch with no profile
            // cache fell back to the 'lbs' default — and offline writes are
            // durable now, so a kg user's queued body weight would convert
            // through the wrong unit and land wrong permanently.
            ...(saved.units ? { units: saved.units } : null),
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

  // Server wins for the fields it owns, once it has them. Also the ONE road
  // into `user` for server-owned fields — the offline cache restore goes
  // through here too, so a cached profile and a fetched one hydrate the display
  // name identically. (The old cache path set only `profile` and left `user`
  // at its seed, which is how airplane-mode cold starts greeted everyone with
  // the demo profile's name.)
  const absorbProfile = useCallback((p: ServerProfile) => {
    setProfile(p);
    setProfileStatus('ready');
    // Owner-stamped envelope: the read side refuses a cache written by a
    // different account, so a missed wipe can't leak one user's profile into
    // another's session.
    AsyncStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ owner: accountIdRef.current, profile: p }),
    ).catch(() => {});
    // The ONE place the pre-auth onboarding stash is retired: onboarded_at
    // arriving means the answers are on the server (or the account never
    // needed them). Clearing any earlier — e.g. right after the draft PUT —
    // would open a crash window that re-lands a fully-saved user on question 1.
    if (p.onboarded_at) void clearPendingDraft();
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
      let restored: ServerProfile | null = null;
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as {
            owner?: string;
            profile?: ServerProfile;
          };
          // Envelope only, owner must match. A legacy bare-profile cache (no
          // envelope) carries no owner and can't be trusted across accounts —
          // drop it and let the next online fetch rewrite it stamped.
          if (parsed.owner && parsed.profile && parsed.owner === accountIdRef.current) {
            restored = parsed.profile;
          }
        } catch {
          /* corrupt cache — treated as absent */
        }
      }
      if (restored) {
        absorbProfile(restored);
      } else {
        if (cached) void AsyncStorage.removeItem(PROFILE_KEY);
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
        setUser(defaultUser);
        void AsyncStorage.multiRemove([
          PREFS_KEY,
          PROFILE_KEY,
          PLAN_KEY,
          PROGRESS_SUMMARY_KEY,
          PROGRESS_BODYWEIGHT_KEY,
          DRAFT_STASH_KEY,
        ]);
        // The in-progress workout snapshot too — its owner check would reject
        // it anyway, but leaving one account's exercise list on a shared
        // device's disk is data hygiene, not just correctness. The OUTBOX is
        // deliberately NOT wiped: queued sets sync when their owner returns.
        void clearActiveWorkout();
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

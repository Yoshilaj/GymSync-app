import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, CoachPersonality, Units } from '@/types';
import { mockUser } from '@/data/mockUser';

const PREFS_KEY = '@gymsync/prefs';

interface UserContextValue {
  user: UserProfile;
  setPersonality: (p: CoachPersonality) => void;
  setUnits: (u: Units) => void;
  setDisplayName: (n: string) => void;
  toggleWorkoutNotifications: () => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile>(mockUser);
  const hydratedRef = useRef(false);

  // Restore locally-persisted preferences (units, notifications, personality).
  useEffect(() => {
    AsyncStorage.getItem(PREFS_KEY)
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw) as Partial<UserProfile>;
          setUser((prev) => ({ ...prev, ...saved }));
        }
      })
      .catch(() => {
        /* corrupt or missing prefs — fall back to defaults */
      })
      .finally(() => {
        hydratedRef.current = true;
      });
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(user)).catch(() => {
      /* best-effort persistence */
    });
  }, [user]);

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
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}

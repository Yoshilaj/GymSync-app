import React, { createContext, useContext, useState, ReactNode } from 'react';
import { UserProfile, CoachPersonality, Units } from '@/types';
import { mockUser } from '@/data/mockUser';

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

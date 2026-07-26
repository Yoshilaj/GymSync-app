/**
 * The user's real weekly plan, fetched from GET /api/plans/active and cached
 * for cold starts. Replaces the old static mockPlan: `todaysWorkout` maps the
 * actual weekday onto the plan's day labels (the mock always returned push).
 *
 * Mounted around the navigation content (AppTabBar consumes it too).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlannedWorkout, WeeklyPlan } from '@/types';
import { fetchActivePlan } from '@/api/plan';
import { useAuth } from '@/auth/AuthContext';
import { useUser } from '@/context/UserContext';

const PLAN_KEY = '@gymsync/plan';
const WEEK_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type PlanStatus = 'loading' | 'ready' | 'empty' | 'error';

interface PlanContextValue {
  plan: WeeklyPlan | null;
  status: PlanStatus;
  refresh: () => Promise<void>;
  /** Today's scheduled workout, or null on rest days / no plan. */
  todaysWorkout: PlannedWorkout | null;
  getWorkoutById: (id: string) => PlannedWorkout | undefined;
}

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { session, getToken } = useAuth();
  const { profile } = useUser();
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [status, setStatus] = useState<PlanStatus>('loading');

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      const fetched = await fetchActivePlan(token);
      setPlan(fetched);
      setStatus(fetched ? 'ready' : 'empty');
      if (fetched) {
        AsyncStorage.setItem(PLAN_KEY, JSON.stringify(fetched)).catch(() => {});
      } else {
        AsyncStorage.removeItem(PLAN_KEY).catch(() => {});
      }
    } catch {
      const cached = await AsyncStorage.getItem(PLAN_KEY).catch(() => null);
      if (cached) {
        setPlan(JSON.parse(cached) as WeeklyPlan);
        setStatus('ready');
      } else {
        setStatus('error');
      }
    }
  }, [getToken]);

  useEffect(() => {
    if (!session) {
      setPlan(null);
      setStatus('loading');
      return;
    }
    // Wait for onboarding — a not-yet-onboarded user has no plan by definition.
    if (profile && !profile.onboarded_at) {
      setPlan(null);
      setStatus('empty');
      return;
    }
    void refresh();
  }, [session, profile?.onboarded_at, refresh]);

  const todaysWorkout = useMemo(() => {
    if (!plan) return null;
    const today = WEEK_SHORT[new Date().getDay()];
    return plan.workouts.find((w) => w.dayLabel === today) ?? null;
  }, [plan]);

  const getWorkoutById = useCallback(
    (id: string) => plan?.workouts.find((w) => w.id === id),
    [plan],
  );

  const value: PlanContextValue = {
    plan,
    status,
    refresh,
    todaysWorkout,
    getWorkoutById,
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}

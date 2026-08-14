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
  useRef,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlannedExercise, PlannedWorkout, WeeklyPlan } from '@/types';
import {
  addPlanExercise,
  deletePlanExercise,
  fetchActivePlan,
  overrideKey,
  PlanApiError,
  putWorkoutOverride,
} from '@/api/plan';
import { getExerciseById } from '@/data/mockExercises';
import { useAuth } from '@/auth/AuthContext';
import { useUser } from '@/context/UserContext';
import { PLAN_KEY } from '@/lib/storageKeys';

const WEEK_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type PlanStatus = 'loading' | 'ready' | 'empty' | 'error';

interface PlanContextValue {
  plan: WeeklyPlan | null;
  status: PlanStatus;
  refresh: () => Promise<void>;
  /** Today's scheduled workout, or null on rest days / no plan. */
  todaysWorkout: PlannedWorkout | null;
  getWorkoutById: (id: string) => PlannedWorkout | undefined;
  /** Append an exercise to a plan day. Rejects if the write fails. With `day`
   * (YYYY-MM-DD) the edit lands on THAT DATE ONLY via a per-date override —
   * every other week keeps the template. */
  addExercise: (
    workoutId: string,
    ex: { exerciseId: string | null; exerciseName: string },
    day?: string,
  ) => Promise<void>;
  /** Remove an exercise. Applied locally at once, rolled back on failure.
   * With `day`, removes from that date only (same override rule as add). */
  removeExercise: (
    workoutId: string,
    planExerciseId: string,
    day?: string,
  ) => Promise<void>;
  /** The workout as it stands on one calendar day: the date's override when
   * one exists, the weekly template otherwise. */
  getWorkoutForDay: (workoutId: string, day: string) => PlannedWorkout | undefined;
}

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { session, getToken } = useAuth();
  const { profile } = useUser();
  const accountIdRef = useRef<string | null>(null);
  accountIdRef.current = session?.user?.id ?? null;
  // Plan target weights arrive as kilograms and are converted at the API
  // boundary (see toWeeklyPlan) — this is the only place that knows which unit
  // to convert into, so it's threaded from here rather than read per screen.
  const units = profile?.units === 'kg' ? 'kg' : 'lbs';
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [status, setStatus] = useState<PlanStatus>('loading');

  // Mutations run across awaits, so they can't trust a captured `plan`.
  const planRef = useRef<WeeklyPlan | null>(plan);
  planRef.current = plan;

  /** The one place that touches the cache, so all three writers stay coherent.
   *  Owner-stamped like the profile cache: the read side refuses an envelope
   *  written by a different account (see storageKeys.ts). */
  const persist = useCallback((next: WeeklyPlan | null) => {
    if (next) {
      AsyncStorage.setItem(
        PLAN_KEY,
        JSON.stringify({ owner: accountIdRef.current, plan: next }),
      ).catch(() => {});
    } else {
      AsyncStorage.removeItem(PLAN_KEY).catch(() => {});
    }
  }, []);

  /** Deliberately NOT inside a setPlan updater — StrictMode double-invokes
   *  those, which would double-write the cache. */
  const commit = useCallback(
    (next: WeeklyPlan) => {
      planRef.current = next;
      setPlan(next);
      persist(next);
    },
    [persist],
  );

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      const fetched = await fetchActivePlan(token, units);
      planRef.current = fetched;
      setPlan(fetched);
      setStatus(fetched ? 'ready' : 'empty');
      persist(fetched);
    } catch {
      const cached = await AsyncStorage.getItem(PLAN_KEY).catch(() => null);
      let restored: WeeklyPlan | null = null;
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { owner?: string; plan?: WeeklyPlan };
          // Envelope + matching owner only. A legacy bare-plan cache has no
          // owner to check, so it can't be trusted across accounts — drop it.
          if (parsed.owner && parsed.plan && parsed.owner === accountIdRef.current) {
            restored = parsed.plan;
          }
        } catch {
          /* corrupt cache — treated as absent */
        }
      }
      if (restored) {
        planRef.current = restored;
        setPlan(restored);
        setStatus('ready');
      } else {
        if (cached) void AsyncStorage.removeItem(PLAN_KEY);
        setStatus('error');
      }
    }
  }, [getToken, persist]);

  /** The date's exercise list: override when present, template otherwise. */
  const effectiveExercises = useCallback(
    (workoutId: string, day: string): PlannedExercise[] | null => {
      const cur = planRef.current;
      if (!cur) return null;
      const overridden = cur.overrides?.[overrideKey(workoutId, day)];
      if (overridden) return overridden;
      return cur.workouts.find((w) => w.id === workoutId)?.exercises ?? null;
    },
    [],
  );

  const getWorkoutForDay = useCallback<PlanContextValue['getWorkoutForDay']>(
    (workoutId, day) => {
      const base = plan?.workouts.find((w) => w.id === workoutId);
      if (!base) return undefined;
      const overridden = plan?.overrides?.[overrideKey(workoutId, day)];
      return overridden ? { ...base, exercises: overridden } : base;
    },
    [plan],
  );

  /** Write one date's complete list: optimistic commit, PUT, rollback. The
   * template rows are never touched — this is the "edit this occurrence"
   * path (migration 019). */
  const commitDayOverride = useCallback(
    async (workoutId: string, day: string, next: PlannedExercise[]) => {
      const before = planRef.current;
      if (!before) return;
      commit({
        ...before,
        overrides: { ...before.overrides, [overrideKey(workoutId, day)]: next },
      });
      try {
        await putWorkoutOverride(await getToken(), workoutId, day, next, units);
      } catch (err) {
        commit(before);
        if (err instanceof PlanApiError && err.status === 409) await refresh();
        throw err;
      }
    },
    [commit, getToken, units, refresh],
  );

  const addExercise = useCallback<PlanContextValue['addExercise']>(
    async (workoutId, ex, day) => {
      if (day) {
        const current = effectiveExercises(workoutId, day);
        if (!current) {
          await refresh();
          throw new PlanApiError(409, 'Plan changed — try again.');
        }
        // Mirrors the server's defaults for a template add (3 × 10, weight
        // seeded later by the user), built client-side because the override
        // owns its whole list.
        const exerciseId = ex.exerciseId ?? `name:${ex.exerciseName}`;
        const meta = ex.exerciseId ? getExerciseById(ex.exerciseId) : undefined;
        const added: PlannedExercise = {
          id: `ovr-${Date.now().toString(36)}`,
          exerciseId,
          name: meta?.name ?? ex.exerciseName,
          sets: Array.from({ length: 3 }, (_, i) => ({
            id: `s${i + 1}`,
            exerciseId,
            targetReps: 10,
            weight: 0,
          })),
        };
        await commitDayOverride(workoutId, day, [...current, added]);
        return;
      }
      const token = await getToken();
      let created;
      try {
        created = await addPlanExercise(token, workoutId, ex, units);
      } catch (err) {
        // 409 = the plan was replaced elsewhere; resync so the screen stops
        // lying. A 422 (duplicate) leaves the plan correct, so refetching it
        // would only replay every row's entrance animation for nothing.
        if (err instanceof PlanApiError && err.status === 409) await refresh();
        throw err;
      }
      // Read state AFTER the await: a refresh may have landed mid-flight.
      const cur = planRef.current;
      if (!cur || !cur.workouts.some((w) => w.id === workoutId)) {
        await refresh();
        return;
      }
      commit({
        ...cur,
        workouts: cur.workouts.map((w) =>
          w.id === workoutId ? { ...w, exercises: [...w.exercises, created] } : w,
        ),
      });
    },
    [getToken, refresh, commit, effectiveExercises, commitDayOverride],
  );

  const removeExercise = useCallback<PlanContextValue['removeExercise']>(
    async (workoutId, planExerciseId, day) => {
      if (day) {
        const current = effectiveExercises(workoutId, day);
        if (!current) return;
        await commitDayOverride(
          workoutId,
          day,
          current.filter((e) => e.id !== planExerciseId),
        );
        return;
      }
      const before = planRef.current;
      if (!before) return;
      // Optimistic: a swipe-to-delete that waits for a round trip reads broken.
      commit({
        ...before,
        workouts: before.workouts.map((w) =>
          w.id === workoutId
            ? { ...w, exercises: w.exercises.filter((e) => e.id !== planExerciseId) }
            : w,
        ),
      });
      try {
        await deletePlanExercise(await getToken(), planExerciseId);
      } catch (err) {
        commit(before);
        throw err;
      }
    },
    [getToken, commit, effectiveExercises, commitDayOverride],
  );

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
    addExercise,
    removeExercise,
    getWorkoutForDay,
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}

/**
 * Owns the backend workout-session lifecycle (REST), independent of the voice
 * socket. The voice connection can come and go — muting the mic must never end
 * the workout — so session ownership lives here and useVoiceSession only
 * attaches to an existing session id.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSession,
  endSession,
  fetchActiveSession,
  patchCurrentExercise,
  SessionSetRow,
  WorkoutSessionRow,
} from '@/api/session';

export type WorkoutSessionStatus = 'idle' | 'starting' | 'active' | 'error';

/** An active session for the same workout, touched within this window, is
 * resumed instead of replaced — closing the screen mid-workout must not
 * restart the session. Older actives are treated as abandoned. */
const RESUME_WINDOW_MS = 8 * 60 * 60 * 1000;

/** The snapshot's workout inside a resumed session — lets the screen rebuild
 * the right day when the user reopened a different one. Shape mirrors
 * plan_store.build_plan_tree (snake_case exercises, camelCase sets). */
export interface SnapshotWorkout {
  id?: string;
  title?: string;
  day_label?: string;
  exercises?: {
    exercise_id?: string | null;
    exercise_name?: string;
    note?: string;
    target_sets?: {
      id?: string;
      exerciseId?: string;
      targetReps?: number;
      repsHigh?: number;
      weight?: number | null;
    }[];
  }[];
}

export interface SessionResume {
  currentExercise: string | null;
  sets: SessionSetRow[];
  /** Set when the resumed session belongs to a DIFFERENT workout than the one
   * the screen was opened with — the screen must switch to this workout. */
  workout?: SnapshotWorkout | null;
}

export interface UseWorkoutSessionArgs {
  /** Returns a fresh Supabase JWT. */
  getToken: () => Promise<string>;
  /** Optional plan to snapshot into the session at start. */
  planId?: string | null;
  /** Which day of the plan is being trained — recorded in the snapshot so the
   * coach's session context leads with the right workout. */
  workoutId?: string | null;
  /** Fired when start() reattached to an existing session instead of creating
   * one — the screen restores its checkmarks and position from this. */
  onResume?: (resume: SessionResume) => void;
  /** Called when a DIFFERENT workout's session is in progress (recent, with
   * logged sets) than the one being opened. Decides whether to resume it or
   * end it and start the requested workout fresh. Absent → resume (protect
   * the in-progress data). */
  resolveConflict?: (info: { title?: string }) => Promise<'resume' | 'fresh'>;
}

export interface WorkoutSessionApi {
  status: WorkoutSessionStatus;
  sessionId: string | null;
  error: string | null;
  /** Create the backend session; resolves with its id (idempotent while active). */
  start: () => Promise<string | null>;
  /** End the backend session (Finish/End workout — NOT mic-off). */
  end: () => Promise<void>;
  /** Best-effort PATCH of the exercise the user is on. */
  setCurrentExercise: (name: string) => void;
}

export function useWorkoutSession({
  getToken,
  planId = null,
  workoutId = null,
  onResume,
  resolveConflict,
}: UseWorkoutSessionArgs): WorkoutSessionApi {
  const [status, setStatus] = useState<WorkoutSessionStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  // Latest callbacks without making start() identity-unstable.
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;
  const resolveConflictRef = useRef(resolveConflict);
  resolveConflictRef.current = resolveConflict;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const start = useCallback(async (): Promise<string | null> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (mountedRef.current) {
      setStatus('starting');
      setError(null);
    }
    try {
      const token = await getToken();

      // Resume: a recent active session survives screen closes and app kills —
      // reattach instead of starting over (the logged sets and the coach's
      // context live server-side). Same workout → always resume. DIFFERENT
      // workout → resume only when real work is logged: an in-progress workout
      // must never be destroyed as collateral of opening another day's screen
      // (creating a new session ends all other actives server-side). Empty
      // shells are replaced normally.
      try {
        const existing = await fetchActiveSession(token);
        if (existing) {
          const snapshot = existing.plan_snapshot as {
            today_workout_id?: string;
            workouts?: SnapshotWorkout[];
          } | null;
          const snapshotWorkoutId = snapshot?.today_workout_id ?? null;
          const updatedAt = existing.updated_at
            ? Date.parse(existing.updated_at)
            : 0;
          const fresh = Date.now() - updatedAt < RESUME_WINDOW_MS;
          const sameWorkout = snapshotWorkoutId === (workoutId ?? null);
          const hasSets = (existing.completed_sets?.length ?? 0) > 0;
          // Different workout with real work logged → the USER decides
          // (resume the in-progress one, or end it and start this day).
          let adopt = fresh && sameWorkout;
          let redirectWorkout: SnapshotWorkout | null = null;
          if (fresh && !sameWorkout && hasSets) {
            redirectWorkout =
              snapshot?.workouts?.find((w) => w.id === snapshotWorkoutId) ?? null;
            const choice = resolveConflictRef.current
              ? await resolveConflictRef.current({ title: redirectWorkout?.title })
              : 'resume';
            adopt = choice === 'resume';
          }
          if (adopt) {
            sessionIdRef.current = existing.id;
            if (mountedRef.current) {
              setSessionId(existing.id);
              setStatus('active');
            }
            onResumeRef.current?.({
              currentExercise: existing.current_exercise,
              sets: existing.completed_sets ?? [],
              workout: sameWorkout ? null : redirectWorkout,
            });
            return existing.id;
          }
        }
      } catch {
        /* resume is best-effort — fall through to a fresh session */
      }

      const session: WorkoutSessionRow = await createSession(token, planId, workoutId);
      sessionIdRef.current = session.id;
      if (mountedRef.current) {
        setSessionId(session.id);
        setStatus('active');
      }
      return session.id;
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
      return null;
    }
  }, [getToken, planId, workoutId]);

  const end = useCallback(async () => {
    const sid = sessionIdRef.current;
    sessionIdRef.current = null;
    if (mountedRef.current) {
      setSessionId(null);
      setStatus('idle');
    }
    if (!sid) return;
    try {
      const token = await getToken();
      await endSession(token, sid);
    } catch {
      /* best-effort teardown */
    }
  }, [getToken]);

  const setCurrentExercise = useCallback(
    (name: string) => {
      const sid = sessionIdRef.current;
      if (!sid) return;
      void (async () => {
        try {
          const token = await getToken();
          await patchCurrentExercise(token, sid, name);
        } catch {
          /* non-critical */
        }
      })();
    },
    [getToken],
  );

  return { status, sessionId, error, start, end, setCurrentExercise };
}

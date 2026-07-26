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
  patchCurrentExercise,
  WorkoutSessionRow,
} from '@/api/session';

export type WorkoutSessionStatus = 'idle' | 'starting' | 'active' | 'error';

export interface UseWorkoutSessionArgs {
  /** Returns a fresh Supabase JWT. */
  getToken: () => Promise<string>;
  /** Optional plan to snapshot into the session at start. */
  planId?: string | null;
  /** Which day of the plan is being trained — recorded in the snapshot so the
   * coach's session context leads with the right workout. */
  workoutId?: string | null;
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
}: UseWorkoutSessionArgs): WorkoutSessionApi {
  const [status, setStatus] = useState<WorkoutSessionStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

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

/**
 * Owns the backend workout-session lifecycle (REST), independent of the voice
 * socket. The voice connection can come and go — muting the mic must never end
 * the workout — so session ownership lives here and useVoiceSession only
 * attaches to an existing session id.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import {
  fetchActiveSession,
  patchCurrentExercise,
  SessionSetRow,
} from '@/api/session';
import { outbox } from '@/lib/outbox';

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
  /** The signed-in account — outbox ops are stamped with it. */
  userId: string | null;
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
  /** Reattach to a locally-persisted session id without any network — the
   * offline counterpart of the resume in start(). */
  adopt: (sessionId: string) => void;
  /** Best-effort PATCH of the exercise the user is on. */
  setCurrentExercise: (name: string) => void;
}

export function useWorkoutSession({
  userId,
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
  /** In-flight start(), so concurrent callers (boot effect + a fast first
   * set-tap + enableVoice) share ONE session instead of minting several —
   * a second create would end the first server-side. */
  const startingRef = useRef<Promise<string | null> | null>(null);
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
    if (startingRef.current) return startingRef.current;
    const inFlight = (async (): Promise<string | null> => {
    if (mountedRef.current) {
      setStatus('starting');
      setError(null);
    }
    try {
      // Resume: a recent active session survives screen closes and app kills —
      // reattach instead of starting over (the logged sets and the coach's
      // context live server-side). Same workout → always resume. DIFFERENT
      // workout → resume only when real work is logged: an in-progress workout
      // must never be destroyed as collateral of opening another day's screen
      // (creating a new session ends all other actives server-side). Empty
      // shells are replaced normally.
      //
      // The token fetch lives INSIDE this best-effort block, raced with the
      // read against a short timeout: resume is a nicety, and an offline
      // token refresh must not hold the session hostage — the fresh-session
      // path below needs no network at all, and the screen's local restore
      // covers offline resume.
      try {
        const existing = await Promise.race([
          getToken().then(fetchActiveSession),
          new Promise<null>((resolve) => setTimeout(resolve, 6000, null)),
        ]);
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

      // Fresh session, minted HERE: the id is a client UUID, created before
      // any network is attempted, and the create rides the outbox. Offline,
      // the id is live immediately — sets log against it and the create
      // replays when connectivity returns (idempotent server-side). Online,
      // the drain below lands it within the same second.
      const id = Crypto.randomUUID();
      sessionIdRef.current = id;
      if (mountedRef.current) {
        setSessionId(id);
        setStatus('active');
      }
      if (userId) {
        await outbox.enqueue(userId, {
          kind: 'create_session',
          sessionId: id,
          planId,
          workoutId,
        });
        // Await the drain (briefly): callers attach things to this id the
        // moment start() resolves — the voice socket's session_start is
        // ownership-checked server-side, so online, the create must land
        // before we hand the id out. Raced with a timeout so a dead or
        // captive-portal network can't hold the workout hostage; the drain
        // then simply retries on the next trigger.
        await Promise.race([
          outbox.drain(userId, getToken),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      }
      return id;
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
      return null;
    }
    })();
    startingRef.current = inFlight;
    try {
      return await inFlight;
    } finally {
      startingRef.current = null;
    }
  }, [getToken, planId, workoutId, userId]);

  const end = useCallback(async () => {
    const sid = sessionIdRef.current;
    sessionIdRef.current = null;
    if (mountedRef.current) {
      setSessionId(null);
      setStatus('idle');
    }
    if (!sid) return;
    // Through the outbox, like the create: "end" used to be fire-and-forget
    // with a swallowed catch, so an offline finish left the session active
    // server-side forever. Queued, it lands on the next drain.
    if (userId) {
      await outbox.enqueue(userId, { kind: 'end_session', sessionId: sid });
      void outbox.drain(userId, getToken);
    }
  }, [getToken, userId]);

  const adopt = useCallback(
    (sid: string) => {
      if (sessionIdRef.current === sid) return;
      sessionIdRef.current = sid;
      if (mountedRef.current) {
        setSessionId(sid);
        setStatus('active');
      }
      // Re-assert the create: if the original create op was lost (or never
      // drained), the restored session would be a black hole — every set
      // 404s forever. The create is idempotent server-side, so re-enqueuing
      // costs one no-op round trip in the happy case; the drain's look-ahead
      // handles it landing behind older queued sets.
      if (userId) {
        void outbox
          .enqueue(userId, {
            kind: 'create_session',
            sessionId: sid,
            planId,
            workoutId,
          })
          .then(() => outbox.drain(userId, getToken));
      }
    },
    [userId, planId, workoutId, getToken],
  );

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

  return { status, sessionId, error, start, end, adopt, setCurrentExercise };
}

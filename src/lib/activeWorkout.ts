/**
 * Local persistence for the workout in progress.
 *
 * The live session used to exist only in React state: kill the app (or leave
 * the screen) mid-workout with no signal and every checkmark evaporated —
 * server-side resume can't help when the server never heard about the session.
 * This mirror writes the session's shape to disk on every change and hands it
 * back on the next open, so an offline workout survives anything short of
 * deleting the app.
 *
 * Owner-stamped and workout-scoped: restored only for the same account AND the
 * same plan day, within the same freshness window the server resume uses.
 * Ends/finishes clear it — the server is the source of truth once a workout is
 * over; this is a life-raft, not a database.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlannedSet } from '@/types';

const KEY = '@gymsync/active-workout';

/** Mirrors the screen's freshness rule for server resume (8h). */
const FRESH_MS = 8 * 60 * 60 * 1000;

/** Serializable projection of the screen's SessionExercise — `meta` (the full
 * catalog object) travels as its id and is rehydrated by the caller. */
export interface PersistedExercise {
  key: string;
  name: string;
  metaId: string | null;
  sets: PlannedSet[];
  note?: string;
  addedBySync?: boolean;
}

export interface ActiveWorkoutSnapshot {
  owner: string;
  sessionId: string;
  workoutId: string | null;
  exerciseIdx: number;
  exercises: PersistedExercise[];
  savedAt: string;
}

export async function saveActiveWorkout(
  snapshot: Omit<ActiveWorkoutSnapshot, 'savedAt'>,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* best-effort — the outbox still has every logged set */
  }
}

export async function loadActiveWorkout(
  owner: string,
  workoutId: string | null,
): Promise<ActiveWorkoutSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as ActiveWorkoutSnapshot;
    if (snap.owner !== owner) {
      // Another account's leftovers — clear rather than leave them on disk.
      void AsyncStorage.removeItem(KEY);
      return null;
    }
    if ((snap.workoutId ?? null) !== (workoutId ?? null)) return null;
    if (Date.now() - Date.parse(snap.savedAt) > FRESH_MS) {
      void AsyncStorage.removeItem(KEY);
      return null;
    }
    // Shape-validate before handing this to the session screen: the screen
    // renders inside a fullScreenModal with no swipe-out, so a malformed
    // snapshot (schema drift across app updates, a NaN index) could lock the
    // user in. Anything suspicious → drop the snapshot, start fresh.
    if (!snap.sessionId || typeof snap.sessionId !== 'string') return null;
    if (!Number.isFinite(snap.exerciseIdx)) return null;
    if (!Array.isArray(snap.exercises) || snap.exercises.length === 0) return null;
    const sane = snap.exercises.every(
      (e) =>
        e &&
        typeof e.name === 'string' &&
        Array.isArray(e.sets) &&
        e.sets.every((s) => s && typeof s === 'object' && Number.isFinite(s.targetReps)),
    );
    if (!sane) {
      void AsyncStorage.removeItem(KEY);
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

export async function clearActiveWorkout(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

/**
 * The write outbox — how logging survives a gym with no signal.
 *
 * Every logging write (create session → its sets → end session; body weight)
 * goes through here instead of straight to fetch: enqueue to AsyncStorage
 * first, then drain. Online, that's an extra millisecond before the same POST.
 * Offline, the op simply waits — drained on app foreground, on connectivity
 * returning (see useOutboxSync), and after every enqueue.
 *
 * Why this is safe to replay, per op — the server side was built for it:
 * - create_session: client-minted UUID; POST /api/session returns an id we
 *   already own unchanged (no re-deactivation of newer sessions).
 * - log_set: upserts on (session_id, exercise_name, set_index) — a replay
 *   updates the same row. Carries performed_at so a Monday flush of Sunday's
 *   workout lands on Sunday in streaks/PRs/charts.
 * - end_session: "already ended" is a success server-side.
 * - log_bodyweight: upserts per (user_id, day); the day is captured at tap
 *   time, not sync time.
 *
 * Ordering is the queue's real contract: completed_sets.session_id is a
 * foreign key, so a session's create MUST land before its sets. The queue is
 * FIFO and the drain stops at the first transport failure, which preserves
 * that order across retries.
 *
 * Ops are owner-stamped like the caches (see storageKeys.ts): a queue written
 * by one account is never drained under another's token, and sign-out leaves
 * it untouched — the work syncs when its owner signs back in.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { ApiError } from '@/api/client';
import { createSession, endSession } from '@/api/session';
import { logBodyWeight, logCompletedSet } from '@/api/progress';

const OUTBOX_KEY = '@gymsync/outbox';

export type OutboxOp =
  | {
      kind: 'create_session';
      sessionId: string;
      planId: string | null;
      workoutId: string | null;
    }
  | {
      kind: 'log_set';
      sessionId: string;
      exerciseId: string | null;
      exerciseName: string;
      setIndex: number;
      reps: number;
      weight: number | null;
      weightUnit: string;
      performedAt: string; // ISO, captured at tap time
      localDay: string; // the user's YYYY-MM-DD at tap time — day buckets
    }
  | { kind: 'end_session'; sessionId: string }
  | { kind: 'log_bodyweight'; weightKg: number; day: string };

interface OutboxEntry {
  id: string;
  owner: string;
  op: OutboxOp;
  queuedAt: string;
  /** Times this entry was reached and deliberately kept (the log_set-404
   * path). Not bumped on transport failures — the world's fault is free. */
  attempts?: number;
}

/** A kept-404 set is retried this many times before it's declared orphaned
 * (its create is unrecoverable) and dropped so the queue can move again. */
const MAX_KEPT_ATTEMPTS = 25;

type Listener = (pending: number) => void;

async function readQueue(): Promise<OutboxEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt queue: losing it is bad, but re-crashing on every read forever
    // is worse. Report and start clean.
    Sentry.captureMessage('[outbox] corrupt queue dropped', 'error');
    return [];
  }
}

async function writeQueue(queue: OutboxEntry[]): Promise<void> {
  if (queue.length === 0) await AsyncStorage.removeItem(OUTBOX_KEY);
  else await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
}

async function performOp(op: OutboxOp, token: string): Promise<void> {
  switch (op.kind) {
    case 'create_session':
      await createSession(token, op.planId, op.workoutId, op.sessionId);
      return;
    case 'log_set':
      await logCompletedSet(token, {
        session_id: op.sessionId,
        exercise_id: op.exerciseId,
        exercise_name: op.exerciseName,
        set_index: op.setIndex,
        reps: op.reps,
        weight: op.weight,
        weight_unit: op.weightUnit,
        performed_at: op.performedAt,
        local_day: op.localDay,
      });
      return;
    case 'end_session':
      await endSession(token, op.sessionId);
      return;
    case 'log_bodyweight':
      await logBodyWeight(token, op.weightKg, op.day);
      return;
  }
}

/** Failures where the OP is fine and the WORLD isn't — network down, server
 * down, and crucially auth (401/403): an expired or revoked token must pause
 * the queue, not delete it. A user signed out with a workout queued gets it
 * synced when they sign back in. 429 likewise. Only a 4xx that the server
 * meant about the op itself (400/404/409/422…) is non-transient. */
function isTransient(e: unknown): boolean {
  if (e instanceof ApiError) {
    return (
      e.status === 0 ||
      e.status >= 500 ||
      e.status === 401 ||
      e.status === 403 ||
      e.status === 429
    );
  }
  return true; // token retrieval failed, unexpected throw — retry later
}

class Outbox {
  /** Serializes drains: a drain requested while one runs is CHAINED, not
   * skipped — so `await outbox.drain(...)` is a real guarantee that the ops
   * queued before the call have been attempted. useWorkoutSession.start()
   * depends on this: it hands its session id to the voice socket only after
   * its awaited drain, and the socket's session_start is ownership-checked
   * server-side. */
  private drainChain: Promise<void> = Promise.resolve();
  /**
   * Serializes every read-modify-write of the stored queue. AsyncStorage has
   * no transactions and each mutation here spans two awaits (read, then
   * write) — without this, a drain finishing an op could write its stale
   * snapshot over an enqueue that landed in between, silently deleting it.
   */
  private lock: Promise<unknown> = Promise.resolve();
  private listeners = new Set<Listener>();
  private pendingCount = 0;

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => {});
    return run;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.pendingCount);
    return () => this.listeners.delete(fn);
  }

  private notify(count: number) {
    this.pendingCount = count;
    this.listeners.forEach((fn) => fn(count));
  }

  /** Refresh the pending count (e.g. on mount) without draining. */
  async refreshCount(owner: string): Promise<void> {
    const queue = await readQueue();
    this.notify(queue.filter((e) => e.owner === owner).length);
  }

  async enqueue(owner: string, op: OutboxOp): Promise<void> {
    await this.withLock(async () => {
      const queue = await readQueue();
      queue.push({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        owner,
        op,
        queuedAt: new Date().toISOString(),
      });
      await writeQueue(queue);
      this.notify(queue.filter((e) => e.owner === owner).length);
    });
  }

  /** Remove one entry by id, against the CURRENT stored queue — never a
   * snapshot — so ops enqueued while a drain is running survive it. */
  private async remove(id: string, owner: string): Promise<void> {
    await this.withLock(async () => {
      const queue = (await readQueue()).filter((q) => q.id !== id);
      await writeQueue(queue);
      this.notify(queue.filter((e) => e.owner === owner).length);
    });
  }

  /**
   * Push every queued op for `owner`, in order, stopping at the first
   * transport failure (so the create-before-sets ordering survives). A real
   * 4xx drops the op — it will never succeed, and blocking the queue behind
   * it would strand everything after it — except a log_set 404, which means
   * this set's create_session hasn't landed yet (order got disturbed): kept
   * for the next pass.
   */
  drain(owner: string, getToken: () => Promise<string>): Promise<void> {
    const run = this.drainChain.then(() => this.drainOnce(owner, getToken));
    this.drainChain = run.catch(() => {});
    return run;
  }

  private async drainOnce(
    owner: string,
    getToken: () => Promise<string>,
  ): Promise<void> {
    try {
      const queue = await readQueue();
      const mine = queue.filter((e) => e.owner === owner);
      this.notify(mine.length);
      if (mine.length === 0) return;
      const token = await getToken();
      for (const entry of mine) {
        try {
          await performOp(entry.op, token);
        } catch (e) {
          if (isTransient(e)) return; // world's fault — retry on the next drain
          const setNotFound =
            entry.op.kind === 'log_set' &&
            e instanceof ApiError &&
            e.status === 404;
          if (setNotFound) {
            // The set's session isn't on the server. Usually its create is
            // AHEAD of it and something went wrong once — but the adopt-
            // restore path can also enqueue the create BEHIND older sets, so
            // look ahead for it and land it out of band before retrying once.
            const sid = entry.op.kind === 'log_set' ? entry.op.sessionId : null;
            const create = mine.find(
              (c) => c.op.kind === 'create_session' && c.op.sessionId === sid,
            );
            if (create && create.id !== entry.id) {
              try {
                await performOp(create.op, token);
                await this.remove(create.id, owner);
                await performOp(entry.op, token);
                await this.remove(entry.id, owner);
                continue;
              } catch {
                /* fall through to the keep/cap logic */
              }
            }
            // Keep order and retry later — but not forever: a session whose
            // create is genuinely gone would wedge the queue for good, taking
            // every later workout hostage. After the cap, declare the set
            // orphaned, report it, and let the queue move.
            const attempts = (entry.attempts ?? 0) + 1;
            if (attempts < MAX_KEPT_ATTEMPTS) {
              await this.bumpAttempts(entry.id, attempts);
              return;
            }
            Sentry.captureMessage(
              `[outbox] dropping orphaned set after ${attempts} attempts`,
              'error',
            );
            await this.remove(entry.id, owner);
            continue;
          }
          // The server rejected the op itself; replaying it forever won't help.
          Sentry.captureException(e, {
            tags: { phase: 'outbox-drain', op: entry.op.kind },
          });
        }
        await this.remove(entry.id, owner);
      }
    } catch {
      /* token unavailable (offline refresh) — next drain tries again */
    }
  }

  private async bumpAttempts(id: string, attempts: number): Promise<void> {
    await this.withLock(async () => {
      const queue = await readQueue();
      const entry = queue.find((q) => q.id === id);
      if (entry) {
        entry.attempts = attempts;
        await writeQueue(queue);
      }
    });
  }

  /** Forget the last published count (account switch) — never show one
   * account's badge to another. */
  resetCount(): void {
    this.notify(0);
  }
}

export const outbox = new Outbox();

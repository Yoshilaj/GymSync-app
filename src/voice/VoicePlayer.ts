/**
 * Coach audio playback for the voice client — segment-streaming edition.
 *
 * The backend TTSes the reply sentence-by-sentence and marks each complete,
 * independently playable MP3 with a {"type":"segment_end"} frame. Chunks
 * accumulate in a segment buffer; each segment_end stages the buffer to its
 * own cache file and queues it, and a sequential playback loop starts on the
 * FIRST segment — the coach starts talking while the rest of the reply is
 * still being generated. `playTurn()` (called on `done`) flushes any
 * remainder and waits for the queue to drain. Old servers that never send
 * segment_end degrade gracefully: everything buffers until `done`, then plays
 * as one segment — the legacy whole-turn behavior.
 *
 * Waveform: while a segment plays, `voicePlayer.waveform` emits RMS buckets
 * for the coach-side VoiceWaveform. Primary source is expo-audio's (hidden)
 * playback-sample API — real signal. It's probed at runtime: if no sample
 * arrives shortly after playback starts, we flag it dead for the app run and
 * fall back to a DECORATIVE low-passed random-walk envelope. The envelope and
 * the final emit([0]) are managed at turn granularity, not per segment, so
 * the wave doesn't flicker to zero between sentences.
 */
import { AudioPlayer, AudioStatus, createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { LevelEmitter } from './levels';

/** Upper bound for one segment (a single sentence). A corrupt file may never
 * fire didJustFinish (AudioStatus carries no error), so the loop must not
 * hang on it forever. */
const SEGMENT_TIMEOUT_MS = 30_000;

let segBuf: Uint8Array[] = [];        // chunks of the segment being received
let queue: File[] = [];               // staged, ready-to-play segment files
let loopRunning = false;
/** Bumped by stop(); invalidates the running loop and any in-flight playFile. */
let epoch = 0;
let activePlayer: AudioPlayer | null = null;
let activeResolve: (() => void) | null = null;
let idleWaiters: (() => void)[] = [];
/** True once any segment was staged this turn — drives the caller's mic re-arm. */
let playedThisTurn = false;
let turnSeq = 0;
let segSeq = 0;

const waveformEmitter = new LevelEmitter();

// ── Coach waveform sources ────────────────────────────────────────────────────
/** True once the hidden sample API proved unavailable this app run. */
let samplingDead = false;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;
let fallbackLevel = 0.35;

function startFallbackEnvelope(): void {
  if (fallbackTimer) return;
  fallbackTimer = setInterval(() => {
    // Decorative only — a smoothed random walk clamped to a speech-y band.
    fallbackLevel = Math.min(
      0.75,
      Math.max(0.15, fallbackLevel + (Math.random() - 0.5) * 0.16),
    );
    const second = Math.min(
      0.75,
      Math.max(0.15, fallbackLevel + (Math.random() - 0.5) * 0.08),
    );
    waveformEmitter.emit([fallbackLevel, second]);
  }, 32);
}

function stopFallbackEnvelope(): void {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
}

function rmsBucket(frames: number[], start: number, end: number): number {
  let sq = 0;
  for (let i = start; i < end; i++) sq += frames[i] * frames[i];
  const rms = Math.sqrt(sq / Math.max(1, end - start));
  return Math.min(1, rms * 2.5);
}

function concatChunks(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Play one staged segment file. Resolves when playback finishes, hits the
 * safety timeout, or is cancelled by stop() (epoch bump + activeResolve).
 * Player teardown happens here; file deletion is the loop's job.
 */
function playFile(file: File, myEpoch: number): Promise<void> {
  return new Promise<void>((resolve) => {
    // keepAudioSessionActive: without it expo-audio deactivates the shared
    // AVAudioSession 100ms after the last segment finishes — right under the
    // freshly re-armed recorder, killing the mic for every turn after the
    // first. The session is released explicitly in useVoiceSession.stop().
    const p = createAudioPlayer(file.uri, { keepAudioSessionActive: true });
    activePlayer = p;

    // Probe the hidden playback-sample API for the real coach waveform.
    let sampleSeen = false;
    let sampleSub: { remove: () => void } | null = null;
    const hidden = p as unknown as {
      setAudioSamplingEnabled?: (enabled: boolean) => void;
    };
    if (!samplingDead && typeof hidden.setAudioSamplingEnabled === 'function') {
      try {
        hidden.setAudioSamplingEnabled(true);
        sampleSub = (p.addListener as (ev: string, cb: (d: unknown) => void) => { remove: () => void })(
          'audioSampleUpdate',
          (data) => {
            sampleSeen = true;
            const frames =
              (data as { channels?: { frames?: number[] }[] })?.channels?.[0]
                ?.frames ?? [];
            if (!frames.length) return;
            const half = Math.floor(frames.length / 2);
            waveformEmitter.emit(
              half > 0
                ? [rmsBucket(frames, 0, half), rmsBucket(frames, half, frames.length)]
                : [rmsBucket(frames, 0, frames.length)],
            );
          },
        );
      } catch {
        samplingDead = true;
      }
    }
    const probeTimer = setTimeout(() => {
      if (!sampleSeen) {
        if (!samplingDead) {
          samplingDead = true;
          console.log(
            '[VoicePlayer] audioSampleUpdate never fired — using decorative envelope',
          );
        }
        startFallbackEnvelope();
      }
    }, 400);
    if (samplingDead) startFallbackEnvelope();

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(probeTimer);
      clearTimeout(safetyTimer);
      sub.remove();
      sampleSub?.remove();
      // Envelope/emit([0]) are turn-level (loop drain / stop), not per segment.
      try {
        p.remove();
      } catch {
        /* already released */
      }
      if (activePlayer === p) {
        activePlayer = null;
        activeResolve = null;
      }
      resolve();
    };

    const safetyTimer = setTimeout(finish, SEGMENT_TIMEOUT_MS);
    const sub = p.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (!status.didJustFinish) return;
      finish();
    });
    // stop() invokes the FULL cleanup (timers, listeners), not just the
    // resolve — otherwise the pending probe timer could restart the
    // decorative envelope after teardown.
    activeResolve = finish;

    if (epoch !== myEpoch) {
      // stop() landed between queueing and starting this file.
      finish();
      return;
    }
    p.play();
  });
}

async function runLoop(): Promise<void> {
  loopRunning = true;
  const myEpoch = epoch;
  while (queue.length > 0 && epoch === myEpoch) {
    const file = queue.shift()!;
    try {
      await playFile(file, myEpoch);
    } catch (e) {
      console.warn('[VoicePlayer] segment failed, skipping', e);
    } finally {
      try {
        file.delete();
      } catch {
        /* cache file may be gone */
      }
    }
  }
  loopRunning = false;
  if (epoch === myEpoch) {
    // Natural drain (stop() handles its own cleanup on cancellation).
    stopFallbackEnvelope();
    waveformEmitter.emit([0]);
    turnSeq++;
    segSeq = 0;
  }
  const waiters = idleWaiters;
  idleWaiters = [];
  waiters.forEach((w) => w());
}

export const voicePlayer = {
  /** Coach-speech level feed for the waveform UI. */
  waveform: waveformEmitter,

  /** Buffer one MP3 chunk of the current segment. */
  enqueue(chunk: ArrayBuffer): void {
    segBuf.push(new Uint8Array(chunk));
  },

  get hasPending(): boolean {
    return segBuf.length > 0 || queue.length > 0 || loopRunning;
  },

  /**
   * The chunks received since the last marker form one complete MP3 — stage
   * it and start playing if idle. No-op on an empty buffer (duplicate or
   * bytes-free markers are harmless).
   */
  endSegment(): void {
    if (segBuf.length === 0) return;
    const mp3 = concatChunks(segBuf);
    segBuf = [];
    try {
      const file = new File(Paths.cache, `coach-seg-${turnSeq}-${segSeq++}.mp3`);
      if (file.exists) file.delete();
      file.create();
      file.write(mp3);
      queue.push(file);
      playedThisTurn = true;
    } catch (e) {
      console.warn('[VoicePlayer] failed to stage segment, dropping', e);
      return;
    }
    if (!loopRunning) void runLoop();
  },

  /**
   * Turn is over (`done` arrived): flush any remainder as a final segment —
   * which is also the entire legacy path for servers without segment_end —
   * and resolve once the queue drains. Returns whether ANY audio played this
   * turn (drives the caller's mic re-arm; text-only turns skip it).
   */
  async playTurn(): Promise<boolean> {
    this.endSegment();
    const played = playedThisTurn;
    if (!loopRunning && queue.length === 0) {
      playedThisTurn = false;
      return played;
    }
    await new Promise<void>((resolve) => {
      idleWaiters.push(resolve);
    });
    playedThisTurn = false;
    return played;
  },

  /** Stop playback and drop everything buffered/queued. Safe to call anytime. */
  async stop(): Promise<void> {
    epoch++;
    segBuf = [];
    playedThisTurn = false;
    for (const file of queue) {
      try {
        file.delete();
      } catch {
        /* cache file may be gone */
      }
    }
    queue = [];
    stopFallbackEnvelope();
    waveformEmitter.emit([0]);
    turnSeq++;
    segSeq = 0;
    const p = activePlayer;
    activePlayer = null;
    if (p) {
      try {
        p.pause();
      } catch {
        /* ignore */
      }
      try {
        p.remove();
      } catch {
        /* ignore */
      }
    }
    // Unblock an in-flight playFile and any playTurn drain waiters.
    activeResolve?.();
    activeResolve = null;
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((w) => w());
  },
};

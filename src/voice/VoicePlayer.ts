/**
 * Coach audio playback for the voice client (Milestone 3).
 *
 * The backend sends the coach's reply as a single MP3 stream split into
 * arbitrary binary WebSocket frames — the chunks are NOT independently
 * decodable, so we buffer a turn's chunks, concatenate them into one MP3,
 * stage it to a cache file, and play the whole thing when the turn ends.
 *
 * Waveform: while a turn plays, `voicePlayer.waveform` emits RMS buckets for
 * the coach-side VoiceWaveform. Primary source is expo-audio's (hidden)
 * playback-sample API — real signal. It's probed at runtime: if no sample
 * arrives shortly after playback starts, we flag it dead for the app run and
 * fall back to a DECORATIVE low-passed random-walk envelope gated by
 * isPlaying (clearly synthetic; better than a frozen line).
 */
import { AudioPlayer, AudioStatus, createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { LevelEmitter } from './levels';

let chunks: Uint8Array[] = [];
let player: AudioPlayer | null = null;
let turnSeq = 0;

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

/** True while the current turn has buffered audio not yet played. */
function hasBuffered(): boolean {
  return chunks.length > 0;
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

export const voicePlayer = {
  /** Coach-speech level feed for the waveform UI. */
  waveform: waveformEmitter,

  /** Buffer one MP3 chunk from the socket. */
  enqueue(chunk: ArrayBuffer): void {
    chunks.push(new Uint8Array(chunk));
  },

  get hasPending(): boolean {
    return hasBuffered();
  },

  /**
   * Play everything buffered for this turn. Resolves when playback finishes,
   * or immediately if nothing was buffered (e.g. a text-only turn).
   */
  async playTurn(): Promise<void> {
    const buffered = chunks;
    chunks = [];
    if (buffered.length === 0) return;

    // Stage the concatenated MP3 to a cache file — expo-audio plays from a file URI.
    const mp3 = concatChunks(buffered);
    const file = new File(Paths.cache, `coach-turn-${turnSeq++}.mp3`);
    if (file.exists) file.delete();
    file.create();
    file.write(mp3);

    // Tear down any leftover player before starting a new one.
    await this.stop();

    await new Promise<void>((resolve) => {
      const p = createAudioPlayer(file.uri);
      player = p;

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

      const cleanupWaveform = () => {
        clearTimeout(probeTimer);
        sampleSub?.remove();
        stopFallbackEnvelope();
        waveformEmitter.emit([0]);
      };

      const sub = p.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (!status.didJustFinish) return;
        sub.remove();
        cleanupWaveform();
        try {
          p.remove();
        } catch {
          /* already released */
        }
        try {
          file.delete();
        } catch {
          /* cache file may be gone */
        }
        if (player === p) player = null;
        resolve();
      });
      p.play();
    });
  },

  /** Stop playback and drop any buffered audio. Safe to call anytime. */
  async stop(): Promise<void> {
    chunks = [];
    stopFallbackEnvelope();
    waveformEmitter.emit([0]);
    const p = player;
    player = null;
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
  },
};

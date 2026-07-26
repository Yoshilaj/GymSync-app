/**
 * Push-based audio-level plumbing for waveform visualization.
 *
 * A WaveformSource delivers small batches of RMS "buckets" (0..1) as audio
 * flows — real signal, not animation. The mic side emits 4 buckets per 64ms
 * frame (16ms resolution ≈ 62Hz); the coach side emits from expo-audio
 * playback samples (or a labeled decorative fallback when that API is
 * unavailable). Rendering lives in components/VoiceWaveform.tsx.
 */

export interface WaveformSource {
  /** cb receives 1..4 RMS buckets (0..1) per audio callback. Returns unsubscribe. */
  subscribe(cb: (buckets: number[]) => void): () => void;
}

/** Minimal fan-out emitter backing every WaveformSource in the app. */
export class LevelEmitter implements WaveformSource {
  private subs = new Set<(buckets: number[]) => void>();

  subscribe(cb: (buckets: number[]) => void): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  emit(buckets: number[]): void {
    for (const cb of this.subs) cb(buckets);
  }

  get hasSubscribers(): boolean {
    return this.subs.size > 0;
  }
}

/**
 * Deterministic "thinking" shimmer: a slow traveling sine bump, amplitude
 * ~0.25. Same component, same data shape — just a synthetic source, so the
 * thinking state doesn't need its own visual system.
 */
export function makeShimmerSource(): WaveformSource & { stop: () => void } {
  const emitter = new LevelEmitter();
  let t = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const ensure = () => {
    if (timer) return;
    timer = setInterval(() => {
      t += 0.35;
      emitter.emit([0.12 + 0.13 * (1 + Math.sin(t)) * 0.5]);
    }, 48);
  };

  return {
    subscribe(cb) {
      ensure();
      const un = emitter.subscribe(cb);
      return () => {
        un();
        if (!emitter.hasSubscribers && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

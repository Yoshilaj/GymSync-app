/**
 * The mic gate — "Machine B" from docs/voice-client-plan.md §5 (Milestone 5).
 *
 * Decides, per PCM frame, whether audio flows to the server. Speech opens the
 * gate (with a pre-roll so the first syllable isn't clipped); silence closes
 * it after a hangover long enough for Deepgram's endpointing (300ms) to fire
 * `speech_final` first. While closed, periodic keepalives stop the server's
 * Deepgram socket from idling out. This is the cost saver: during rest
 * periods, no audio-minutes are billed.
 *
 * Timing is frame-driven (frames arrive at a fixed cadence), so the gate is a
 * pure state machine — no timers, fully unit-testable.
 *
 * Passthrough mode: with no VAD (Silero failed to load / Expo Go) every frame
 * is forwarded while un-muted — exactly the pre-M5 continuous loop, where the
 * audio itself keeps Deepgram alive.
 *
 * Muting (half-duplex, Machine A): the hook mutes the gate whenever the phase
 * isn't `listening`. While muted, frames still run VAD (recurrent state stays
 * warm) and fill the pre-roll ring, but nothing is sent and no keepalives fire.
 * On unmute the ring survives — so words spoken just before the phase flipped
 * (mic spin-up, coach still finishing) flush with the first gate-open instead
 * of being clipped. Deepgram hears nothing while muted; that matches the old
 * frame-drop behavior, and the server-side SDK keepalive covers idle timeouts.
 */
import type { SileroVad } from './SileroVad';

export interface MicGateConfig {
  /** Speech probability that opens the gate. */
  openThreshold: number;
  /** Probability below which a frame counts as silence (hysteresis < open). */
  closeThreshold: number;
  /** Frames kept while silent and flushed when speech starts (~320ms at 64ms/frame). */
  preRollFrames: number;
  /** Silence tolerated before the gate closes. Must exceed Deepgram endpointing (300ms). */
  hangoverMs: number;
  /** Keepalive cadence while the gate is closed. */
  keepaliveIntervalMs: number;
  /** Duration of one mic frame (bufferSize 2048 bytes = 1024 samples = 64ms). */
  frameMs: number;
}

export const DEFAULT_GATE_CONFIG: MicGateConfig = {
  // Hysteresis narrowed to 0.4/0.35 deliberately: faster opens on soft speech
  // onsets ("I hit...") — still a valid band, and close behavior is unchanged.
  openThreshold: 0.4,
  closeThreshold: 0.35,
  preRollFrames: 12, // ~768ms @64ms frames — covers mic spin-up + soft onsets
  hangoverMs: 700,
  keepaliveIntervalMs: 5000,
  frameMs: 64,
};

export interface MicGateEvents {
  /** Forward these frames to the socket (pre-roll flush arrives as a batch). */
  send: (frames: ArrayBuffer[]) => void;
  /** Gate has been closed for another keepalive interval. */
  keepalive: () => void;
  /** The gate opened (user speaking) or closed. */
  speakingChanged: (speaking: boolean) => void;
  /** Smoothed mic level 0..1, every frame — for UI only, never for gating. */
  level: (value: number) => void;
  /**
   * Raw per-frame waveform data: 4 × 16ms RMS buckets (0..1, unsmoothed) —
   * real 62Hz signal for the waveform UI. Optional; skipped when absent.
   */
  levelBuckets?: (buckets: number[]) => void;
}

export class MicGate {
  private vad: SileroVad | null = null;
  /** Starts muted; the hook unmutes when Machine A enters `listening`. */
  private muted = true;
  private open = false;
  private preRoll: ArrayBuffer[] = [];
  private hangoverLeftMs = 0;
  private silentMsSinceKeepalive = 0;
  private smoothedLevel = 0;
  /** Serializes async VAD inference so recurrent state sees frames in order. */
  private chain: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly events: MicGateEvents,
    private readonly config: MicGateConfig = DEFAULT_GATE_CONFIG,
  ) {}

  /**
   * Attach the VAD once it finishes loading (the gate starts in passthrough
   * and upgrades in place — audio flows correctly during the load).
   */
  setVad(vad: SileroVad | null): void {
    this.vad = vad;
  }

  /**
   * Half-duplex mute (phase ≠ listening). Muting closes the gate but KEEPS the
   * pre-roll ring rolling and the VAD state warm — audio through the mic is
   * continuous, so the next unmute + gate-open can flush speech that started
   * moments before the phase flip.
   */
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (muted && this.open) {
      this.open = false;
      this.hangoverLeftMs = 0;
      this.events.speakingChanged(false);
    }
    this.silentMsSinceKeepalive = 0;
  }

  /** Feed one mic frame. Safe to call from the mic callback (sync). */
  pushFrame(frame: ArrayBuffer): void {
    if (this.disposed) return;
    this.emitLevel(frame);

    if (!this.vad) {
      // Passthrough: continuous streaming while unmuted (audio itself is the
      // keepalive). While muted, ring the frames so unmute flushes recent
      // audio — the same clipping fix, minus the VAD.
      if (this.muted) {
        this.ringPush(frame);
        return;
      }
      if (this.preRoll.length > 0) {
        const burst = [...this.preRoll, frame];
        this.preRoll = [];
        this.events.send(burst);
        return;
      }
      this.events.send([frame]);
      return;
    }

    const vad = this.vad;
    this.chain = this.chain.then(async () => {
      if (this.disposed) return;
      try {
        const prob = await vad.process(frame);
        this.applyGate(frame, prob);
      } catch (e) {
        // Inference broke mid-session — drop to passthrough for good.
        console.warn('[MicGate] VAD failed, switching to passthrough:', e);
        this.vad = null;
        if (!this.muted) this.events.send([frame]);
      }
    });
  }

  /**
   * Full teardown (session stop / unmount) — NOT for phase changes; those use
   * setMuted. Forgets the utterance, the ring, and the VAD state.
   */
  reset(): void {
    if (this.open) this.events.speakingChanged(false);
    this.muted = true;
    this.open = false;
    this.preRoll = [];
    this.hangoverLeftMs = 0;
    this.silentMsSinceKeepalive = 0;
    this.smoothedLevel = 0;
    this.vad?.reset();
    this.events.level(0);
  }

  /** Permanently stop emitting (unmount). */
  dispose(): void {
    this.disposed = true;
    this.reset();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private ringPush(frame: ArrayBuffer): void {
    this.preRoll.push(frame);
    if (this.preRoll.length > this.config.preRollFrames) this.preRoll.shift();
  }

  private applyGate(frame: ArrayBuffer, prob: number): void {
    const cfg = this.config;

    if (this.muted) {
      // Half-duplex mute: keep the ring rolling (VAD state was already updated
      // by process()), but never send, keepalive, or flip `speaking`.
      this.ringPush(frame);
      return;
    }

    if (!this.open) {
      if (prob >= cfg.openThreshold) {
        // Speech! Flush the pre-roll (context + first syllable) plus this frame.
        this.open = true;
        this.hangoverLeftMs = cfg.hangoverMs;
        this.silentMsSinceKeepalive = 0;
        const burst = [...this.preRoll, frame];
        this.preRoll = [];
        this.events.speakingChanged(true);
        this.events.send(burst);
        return;
      }
      // Still silent: remember recent audio, tick the keepalive clock.
      this.ringPush(frame);
      this.silentMsSinceKeepalive += cfg.frameMs;
      if (this.silentMsSinceKeepalive >= cfg.keepaliveIntervalMs) {
        this.silentMsSinceKeepalive = 0;
        this.events.keepalive();
      }
      return;
    }

    // Gate open: every frame flows (hangover frames give Deepgram the trailing
    // silence its endpointing needs to emit speech_final).
    this.events.send([frame]);
    if (prob >= cfg.closeThreshold) {
      this.hangoverLeftMs = cfg.hangoverMs;
      return;
    }
    this.hangoverLeftMs -= cfg.frameMs;
    if (this.hangoverLeftMs <= 0) {
      this.open = false;
      this.preRoll = [];
      this.silentMsSinceKeepalive = 0;
      this.vad?.reset(); // next utterance starts from a clean recurrent state
      this.events.speakingChanged(false);
    }
  }

  private emitLevel(frame: ArrayBuffer): void {
    const pcm = new Int16Array(frame);

    // Waveform buckets: 4 sub-RMS values per frame (raw — the waveform wants
    // real signal, not smoothing). Skipped entirely when nobody listens.
    if (this.events.levelBuckets) {
      const buckets: number[] = [];
      const size = Math.max(1, Math.floor(pcm.length / 4));
      for (let b = 0; b < 4; b++) {
        let sq = 0;
        const start = b * size;
        const end = b === 3 ? pcm.length : start + size;
        for (let i = start; i < end; i++) {
          const s = pcm[i] / 32768;
          sq += s * s;
        }
        const rms = Math.sqrt(sq / Math.max(1, end - start));
        buckets.push(Math.min(1, rms * 4));
      }
      this.events.levelBuckets(buckets);
    }

    let sumSq = 0;
    for (let i = 0; i < pcm.length; i++) {
      const s = pcm[i] / 32768;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / (pcm.length || 1));
    // Speech RMS lives around 0.05–0.3; stretch to a usable 0..1 UI range.
    const instant = Math.min(1, rms * 4);
    // Fast attack, slow decay — bars jump with speech and fall smoothly.
    this.smoothedLevel =
      instant > this.smoothedLevel ? instant : this.smoothedLevel * 0.85;
    this.events.level(this.smoothedLevel);
  }
}

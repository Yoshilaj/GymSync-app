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
  openThreshold: 0.5,
  closeThreshold: 0.35,
  preRollFrames: 5,
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
}

export class MicGate {
  private vad: SileroVad | null = null;
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

  /** Feed one mic frame. Safe to call from the mic callback (sync). */
  pushFrame(frame: ArrayBuffer): void {
    if (this.disposed) return;
    this.emitLevel(frame);

    if (!this.vad) {
      // Passthrough: continuous streaming, audio itself is the keepalive.
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
        this.events.send([frame]);
      }
    });
  }

  /**
   * Close the gate and forget the utterance (phase left `listening`, or
   * session teardown). Level/speaking reset so the UI doesn't freeze mid-bar.
   */
  reset(): void {
    if (this.open) this.events.speakingChanged(false);
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

  private applyGate(frame: ArrayBuffer, prob: number): void {
    const cfg = this.config;

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
      this.preRoll.push(frame);
      if (this.preRoll.length > cfg.preRollFrames) this.preRoll.shift();
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

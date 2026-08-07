/**
 * Microphone capture for the voice client (Milestone 2).
 *
 * Wraps react-native-live-audio-stream to emit raw PCM frames in the exact format
 * the backend expects: Linear16, 16kHz, mono (docs/voice-client-plan.md §7, and
 * voice.py's LiveOptions). The native side hands us base64 chunks; we decode them to
 * ArrayBuffer so they can be sent as binary WebSocket frames.
 *
 * The native module is require()d lazily so merely importing this file doesn't crash
 * in Expo Go (where the native module is absent). Real audio needs a dev build — see §2.
 */
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from 'expo-audio';

export type PcmFrameHandler = (frame: ArrayBuffer) => void;

/**
 * EXPERIMENT (default off): Android hardware echo cancellation via
 * VOICE_COMMUNICATION (audioSource 7) instead of VOICE_RECOGNITION (6).
 * Engages the platform echo canceller for barge-in, but also changes
 * gain/noise processing — A/B Deepgram accuracy on-device before keeping.
 */
const ANDROID_HW_AEC_EXPERIMENT = false;

// MUST match backend/app/agents/voice.py:
//   LiveOptions(encoding="linear16", sample_rate=16000, channels=1)
// A drift here yields garbled or silent audio with no error (§7).
const CAPTURE_OPTIONS = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  // Android capture source; ignored on iOS. On iOS the lib itself sets
  // AVAudioSession mode .voiceChat (voice processing incl. AEC) on every
  // recorder start — see useVoiceSession's IOS_AEC_REARM_ON_PLAYBACK.
  audioSource: ANDROID_HW_AEC_EXPERIMENT ? 7 : 6,
  // 2048 bytes = 1024 samples = 64ms/frame: exactly 2 Silero VAD windows, and
  // half the gate-open latency of the old 4096. (M5)
  bufferSize: 2048,
  wavFile: 'gymsync-capture.wav', // required by the lib; unused (we stream, not save)
};

interface AudioRecordModule {
  init: (opts: typeof CAPTURE_OPTIONS) => void;
  start: () => void;
  stop: () => Promise<string>;
  on: (event: 'data', cb: (base64: string) => void) => void;
}

let audioRecord: AudioRecordModule | null = null;
let running = false;

function getModule(): AudioRecordModule {
  if (!audioRecord) {
    // Lazy require: only touch the native module when audio actually starts, so the
    // app still imports in Expo Go for everything that isn't the live voice flow.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    audioRecord = require('react-native-live-audio-stream')
      .default as AudioRecordModule;
    audioRecord.init(CAPTURE_OPTIONS);
  }
  return audioRecord;
}

/**
 * Ask for mic permission and put the audio session into record mode.
 * Returns false if the user denied access (caller should surface an error).
 */
/**
 * (Re-)apply the shared audio-session mode — no permission prompt. expo-audio
 * players reconfigure the iOS session on create/remove, which silently kills
 * recording; call this again after coach playback ends to revive it.
 */
export async function reassertAudioMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true, // coach replies must play through the silent switch (M3)
    // Duck (don't kill) the user's music: gym sessions run on top of Spotify.
    // True per-utterance pause/resume isn't possible on iOS without dropping
    // our own audio session — which would also drop the background mic.
    interruptionMode: 'duckOthers',
    // With UIBackgroundModes:["audio"] (app.json) this keeps the audio session —
    // and therefore the mic, the VAD gate, and the socket — alive when the
    // screen locks: the whole hands-free loop runs from the pocket.
    shouldPlayInBackground: true,
    shouldRouteThroughEarpiece: false,
  });
  // setAudioModeAsync only sets the category — it never (re)activates the
  // session, so a re-arm after an external deactivation (Siri, a call, an
  // expo-audio player teardown) would restart the recorder onto a dead
  // session. Activate explicitly.
  await setIsAudioActiveAsync(true);
}

/**
 * Deactivate the shared audio session (best effort). Coach players hold the
 * session active for the whole voice session (keepAudioSessionActive), so
 * without this the user's music would stay ducked after the session ends.
 */
export async function releaseAudioSession(): Promise<void> {
  try {
    await setIsAudioActiveAsync(false);
  } catch {
    /* other audio may still be running — releasing is best effort */
  }
}

export async function ensureMicAccess(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync();
  if (!granted) return false;
  await reassertAudioMode();
  return true;
}

export const voiceMic = {
  /** Begin capturing; `onFrame` fires once per PCM frame. No-op if already running. */
  start(onFrame: PcmFrameHandler): void {
    if (running) return;
    const mod = getModule();
    running = true;
    // .on() replaces any prior listener, so re-registering per start is safe.
    mod.on('data', (base64) => {
      if (!running) return;
      onFrame(base64ToArrayBuffer(base64));
    });
    mod.start();
  },

  /** Stop capturing. Safe to call when not running. */
  async stop(): Promise<void> {
    if (!running || !audioRecord) return;
    running = false;
    try {
      await audioRecord.stop();
    } catch {
      /* already stopped / native teardown race — ignore */
    }
  },

  /**
   * Force-restart the recorder (stop + start). `.on()` replaces the prior
   * listener, so re-registering is safe. Used to re-arm capture after coach
   * playback disturbed the shared audio session.
   */
  async restart(onFrame: PcmFrameHandler): Promise<void> {
    await this.stop();
    this.start(onFrame);
  },

  get isRunning(): boolean {
    return running;
  },
};

// Minimal base64 → ArrayBuffer. Hermes has no atob/Buffer, and pulling a polyfill in
// just for the mic hot path isn't worth it — this runs per frame (~8×/sec).
const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < B64_ALPHABET.length; i++) {
    table[B64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const len = base64.length;
  let padding = 0;
  if (len >= 1 && base64[len - 1] === '=') padding++;
  if (len >= 2 && base64[len - 2] === '=') padding++;
  const byteLength = (len * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLength);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = B64_LOOKUP[base64.charCodeAt(i)];
    const e2 = B64_LOOKUP[base64.charCodeAt(i + 1)];
    const e3 = B64_LOOKUP[base64.charCodeAt(i + 2)];
    const e4 = B64_LOOKUP[base64.charCodeAt(i + 3)];
    if (p < byteLength) bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < byteLength) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < byteLength) bytes[p++] = ((e3 & 3) << 6) | e4;
  }
  return bytes.buffer;
}

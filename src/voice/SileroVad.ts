/**
 * Silero VAD v5 inference for the mic gate (Milestone 5).
 *
 * Runs the ~2MB silero_vad.onnx on-device via onnxruntime-react-native and
 * returns a speech probability per mic frame. The model is recurrent: a state
 * tensor (and, in the standard v5 export, a 64-sample audio context) carries
 * across 512-sample windows and must be reset between utterances.
 *
 * Everything here degrades gracefully: if the native module or the model
 * fails to load (Expo Go, bad build), load() resolves null and MicGate falls
 * back to continuous streaming — the session never breaks over VAD.
 */
import { Asset } from 'expo-asset';
import { devLog, warnDegraded } from '@/lib/log';

/** Samples per inference window at 16kHz (32ms). Fixed by the model. */
const WINDOW = 512;
/** Leading audio context the v5 export expects prepended to each window. */
const CONTEXT = 64;
/** Recurrent state shape: [2, 1, 128]. */
const STATE_SIZE = 2 * 1 * 128;
const SAMPLE_RATE = 16000;

/* Minimal structural types for onnxruntime-react-native (lazily required so
 * importing this file never touches the native module). */
interface OrtTensor {
  data: Float32Array;
}
interface OrtSession {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
}
interface OrtModule {
  InferenceSession: { create(pathOrUri: string): Promise<OrtSession> };
  Tensor: new (
    type: string,
    data: Float32Array | BigInt64Array,
    dims: readonly number[],
  ) => unknown;
}

export class SileroVad {
  private state = new Float32Array(STATE_SIZE);
  private context = new Float32Array(CONTEXT);
  /** Leftover samples when a frame isn't a whole number of windows. */
  private residual = new Float32Array(0);

  private constructor(
    private readonly ort: OrtModule,
    private readonly session: OrtSession,
    /** Window length the export accepts: 576 (context ‖ window) or bare 512. */
    private readonly inputLen: number,
    /** Dims the export accepts for the sr scalar: [] or [1]. */
    private readonly srDims: readonly number[],
  ) {}

  /**
   * Load the native runtime and the bundled model. Resolves null on ANY
   * failure — callers treat null as "no VAD, stream continuously".
   */
  static async load(): Promise<SileroVad | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ort = require('onnxruntime-react-native') as OrtModule;

      const asset = Asset.fromModule(
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../../assets/models/silero_vad.onnx'),
      );
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;

      let session: OrtSession;
      try {
        session = await ort.InferenceSession.create(uri);
      } catch {
        // Known ORT quirk on iOS: create() may want a bare path, not file://.
        session = await ort.InferenceSession.create(uri.replace(/^file:\/\//, ''));
      }

      const names = session.inputNames;
      if (!names.includes('input') || !names.includes('state') || !names.includes('sr')) {
        throw new Error(`Unexpected VAD model inputs: ${names.join(', ')}`);
      }

      // v5 exports vary: probe which input length / sr dims this one accepts.
      for (const inputLen of [CONTEXT + WINDOW, WINDOW]) {
        for (const srDims of [[], [1]] as const) {
          const vad = new SileroVad(ort, session, inputLen, srDims);
          try {
            await vad.runWindow(new Float32Array(inputLen));
            vad.reset();
            devLog('SileroVad', `ready (input=[1,${inputLen}], sr dims=[${srDims}])`);
            return vad;
          } catch {
            /* try the next variant */
          }
        }
      }
      throw new Error('No known input variant accepted by the VAD model');
    } catch (e) {
      warnDegraded('SileroVad', 'unavailable, falling back to continuous streaming', e);
      return null;
    }
  }

  /**
   * Score one PCM frame (Linear16 mono 16kHz). Returns the max speech
   * probability across the frame's 32ms windows. Call sequentially — the
   * recurrent state assumes in-order windows (MicGate serializes frames).
   */
  async process(frame: ArrayBuffer): Promise<number> {
    const pcm = new Int16Array(frame);

    // residual ‖ frame, normalized to [-1, 1].
    const samples = new Float32Array(this.residual.length + pcm.length);
    samples.set(this.residual);
    for (let i = 0; i < pcm.length; i++) {
      samples[this.residual.length + i] = pcm[i] / 32768;
    }

    const wholeWindows = Math.floor(samples.length / WINDOW);
    this.residual = samples.slice(wholeWindows * WINDOW);

    let maxProb = 0;
    for (let w = 0; w < wholeWindows; w++) {
      const window = samples.subarray(w * WINDOW, (w + 1) * WINDOW);

      let input: Float32Array;
      if (this.inputLen === CONTEXT + WINDOW) {
        input = new Float32Array(this.inputLen);
        input.set(this.context);
        input.set(window, CONTEXT);
      } else {
        input = new Float32Array(window);
      }

      const prob = await this.runWindow(input);
      if (prob > maxProb) maxProb = prob;

      if (this.inputLen === CONTEXT + WINDOW) {
        this.context = new Float32Array(window.subarray(WINDOW - CONTEXT));
      }
    }
    return maxProb;
  }

  /** Forget the utterance: zero the recurrent state, context, and residual. */
  reset(): void {
    this.state = new Float32Array(STATE_SIZE);
    this.context = new Float32Array(CONTEXT);
    this.residual = new Float32Array(0);
  }

  private async runWindow(input: Float32Array): Promise<number> {
    const { Tensor } = this.ort;
    const out = await this.session.run({
      input: new Tensor('float32', input, [1, input.length]),
      state: new Tensor('float32', this.state, [2, 1, 128]),
      sr: new Tensor('int64', BigInt64Array.from([BigInt(SAMPLE_RATE)]), this.srDims),
    });
    const stateN = out.stateN ?? out.state_n;
    if (stateN) this.state = new Float32Array(stateN.data);
    const output = out.output ?? out[this.session.outputNames[0]];
    return output.data[0];
  }
}

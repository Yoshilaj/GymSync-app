/**
 * Coach audio playback for the voice client (Milestone 3).
 *
 * The backend sends the coach's reply as a single MP3 stream (ElevenLabs) split into
 * arbitrary binary WebSocket frames — the chunks are NOT independently decodable, so we
 * can't play them one-by-one. Instead we buffer a turn's chunks, concatenate them into one
 * MP3, stage it to a cache file, and play the whole thing when the turn ends (`done`).
 *
 * Tradeoff: audio starts once the turn is fully received rather than progressively. Coach
 * replies are short, so the gap is small; true streaming playback is a later optimization.
 */
import { AudioPlayer, AudioStatus, createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

let chunks: Uint8Array[] = [];
let player: AudioPlayer | null = null;
let turnSeq = 0;

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
  /** Buffer one MP3 chunk from the socket. */
  enqueue(chunk: ArrayBuffer): void {
    chunks.push(new Uint8Array(chunk));
  },

  get hasPending(): boolean {
    return hasBuffered();
  },

  /**
   * Play everything buffered for this turn. Resolves when playback finishes, or
   * immediately if nothing was buffered (e.g. a text-only turn).
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
      const sub = p.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (!status.didJustFinish) return;
        sub.remove();
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

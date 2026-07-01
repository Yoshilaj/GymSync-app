import { ClientMessage, ServerMessage } from './protocol';

export interface VoiceSocketHandlers {
  /** A parsed JSON control message from the server. */
  onMessage: (msg: ServerMessage) => void;
  /** A binary MP3 audio chunk (wired up from Milestone 3 onward). */
  onBinary?: (data: ArrayBuffer) => void;
  onOpen?: () => void;
  onClose?: (info: { code: number; reason: string }) => void;
  onError?: (err: unknown) => void;
}

/**
 * Thin typed wrapper around the platform WebSocket for the voice channel.
 * Handles JSON control messages both ways and raw binary frames (audio).
 */
export class VoiceSocket {
  private ws: WebSocket | null = null;

  constructor(
    private readonly url: string,
    private readonly handlers: VoiceSocketHandlers,
  ) {}

  connect(): void {
    const ws = new WebSocket(this.url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => this.handlers.onOpen?.();

    ws.onmessage = (ev: WebSocketMessageEvent) => {
      if (typeof ev.data === 'string') {
        try {
          this.handlers.onMessage(JSON.parse(ev.data) as ServerMessage);
        } catch {
          this.handlers.onError?.(new Error(`Non-JSON text frame: ${ev.data}`));
        }
      } else {
        // Binary MP3 audio — consumed from Milestone 3 onward.
        this.handlers.onBinary?.(ev.data as ArrayBuffer);
      }
    };

    ws.onerror = (ev) => this.handlers.onError?.(ev);
    ws.onclose = (ev) =>
      this.handlers.onClose?.({ code: ev.code, reason: ev.reason });

    this.ws = ws;
  }

  /** Send a JSON control message. */
  send(msg: ClientMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  /** Send a raw PCM audio frame (mic capture, from Milestone 2 onward). */
  sendBinary(data: ArrayBuffer): void {
    this.ws?.send(data);
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close(): void {
    if (this.ws) {
      // Detach handlers so a deliberate close doesn't fire onClose/onError.
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

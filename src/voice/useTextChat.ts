/**
 * Text chat with the coach over the voice WebSocket in text mode
 * (session_start with voice:false, session_id:null — no workout session, no
 * mic). Replaces the scripted mock replies with the real agent: user messages
 * go up as {type:'message'}, replies stream back as text_delta and finalize on
 * done; app_action packets surface as inline system chips in the transcript.
 *
 * The socket connects lazily on first send and reconnects on the next send
 * after a background disconnect, so a stale connection never makes chat look
 * broken.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { voiceSocketUrl } from './config';
import { VoiceSocket } from './VoiceSocket';
import { AppActionMessage, ServerMessage } from './protocol';

export type ChatItem =
  | {
      kind: 'message';
      id: string;
      author: 'user' | 'sync';
      text: string;
      streaming?: boolean;
      failed?: boolean;
    }
  | { kind: 'action'; id: string; text: string };

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

function actionText(action: AppActionMessage): string | null {
  switch (action.action) {
    case 'log_set':
      return action.weight != null
        ? `Logged: ${action.exercise} ${action.reps} × ${action.weight}`
        : `Logged: ${action.exercise} ${action.reps} reps`;
    case 'add_exercise':
      return `Added ${action.exercise} to today`;
    case 'swap_exercise':
      return `Swapped ${action.from} → ${action.to}`;
    case 'modify_plan':
      return 'Updated your plan';
    default:
      // Timer actions are meaningless without a live workout screen.
      return null;
  }
}

export interface TextChatApi {
  items: ChatItem[];
  /** True from send until the reply finishes. */
  busy: boolean;
  /** Connection-level problem (auth, network) — shown as a banner. */
  error: string | null;
  send: (text: string) => void;
  /** Re-send a failed user message. */
  retry: (id: string) => void;
}

export function useTextChat({
  userId,
  getToken,
  greeting,
}: {
  userId: string;
  getToken: () => Promise<string>;
  /** Optional single opening coach message. */
  greeting?: string;
}): TextChatApi {
  const [items, setItems] = useState<ChatItem[]>(
    greeting
      ? [{ kind: 'message', id: uid('g'), author: 'sync', text: greeting }]
      : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<VoiceSocket | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const pendingUserIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const finalizeStream = useCallback(() => {
    const sid = streamIdRef.current;
    streamIdRef.current = null;
    if (sid) {
      setItems((prev) =>
        prev.map((it) =>
          it.kind === 'message' && it.id === sid
            ? { ...it, streaming: false }
            : it,
        ),
      );
    }
    if (mountedRef.current) setBusy(false);
  }, []);

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'text_delta': {
          setItems((prev) => {
            const sid = streamIdRef.current;
            if (sid) {
              return prev.map((it) =>
                it.kind === 'message' && it.id === sid
                  ? { ...it, text: it.text + msg.text }
                  : it,
              );
            }
            const id = uid('s');
            streamIdRef.current = id;
            return [
              ...prev,
              { kind: 'message', id, author: 'sync', text: msg.text, streaming: true },
            ];
          });
          break;
        }
        case 'app_action': {
          const text = actionText(msg);
          if (text) {
            setItems((prev) => [...prev, { kind: 'action', id: uid('a'), text }]);
          }
          break;
        }
        case 'done':
          finalizeStream();
          break;
        case 'error':
          finalizeStream();
          if (mountedRef.current) setError(msg.message);
          break;
        default:
          break;
      }
    },
    [finalizeStream],
  );

  const dropSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    readyRef.current = null;
  }, []);

  /** Connect + handshake once; reuse the open socket between turns. */
  const ensureConnected = useCallback(async (): Promise<VoiceSocket> => {
    const existing = socketRef.current;
    if (existing?.isOpen && readyRef.current) {
      await readyRef.current;
      return existing;
    }
    dropSocket();

    const token = await getToken();
    let resolveReady!: () => void;
    let rejectReady!: (e: Error) => void;
    readyRef.current = new Promise<void>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    });

    const socket = new VoiceSocket(voiceSocketUrl(userId, token), {
      onOpen: () =>
        socket.send({ type: 'session_start', session_id: null, voice: false }),
      onMessage: (msg) => {
        if (msg.type === 'ack') {
          resolveReady();
          return;
        }
        handleMessage(msg);
      },
      onError: () => {
        rejectReady(new Error('Connection failed'));
      },
      onClose: ({ code }) => {
        rejectReady(
          new Error(code === 4001 ? 'Authentication rejected' : 'Disconnected'),
        );
        // Mark a mid-stream reply as finished; next send reconnects silently.
        finalizeStream();
        socketRef.current = null;
        readyRef.current = null;
      },
    });
    socketRef.current = socket;
    socket.connect();
    await readyRef.current;
    return socket;
  }, [userId, getToken, handleMessage, finalizeStream, dropSocket]);

  const deliver = useCallback(
    async (userItemId: string, text: string) => {
      setBusy(true);
      setError(null);
      pendingUserIdRef.current = userItemId;
      try {
        const socket = await ensureConnected();
        socket.send({ type: 'message', text });
        pendingUserIdRef.current = null;
      } catch (e) {
        pendingUserIdRef.current = null;
        if (mountedRef.current) {
          setBusy(false);
          setItems((prev) =>
            prev.map((it) =>
              it.kind === 'message' && it.id === userItemId
                ? { ...it, failed: true }
                : it,
            ),
          );
          setError(e instanceof Error ? e.message : 'Message failed');
        }
      }
    },
    [ensureConnected],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const id = uid('u');
      setItems((prev) => [
        ...prev,
        { kind: 'message', id, author: 'user', text: trimmed },
      ]);
      void deliver(id, trimmed);
    },
    [deliver],
  );

  const retry = useCallback(
    (id: string) => {
      const item = items.find((it) => it.kind === 'message' && it.id === id);
      if (!item || item.kind !== 'message' || !item.failed) return;
      setItems((prev) =>
        prev.map((it) =>
          it.kind === 'message' && it.id === id ? { ...it, failed: false } : it,
        ),
      );
      void deliver(id, item.text);
    },
    [items, deliver],
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  return { items, busy, error, send, retry };
}

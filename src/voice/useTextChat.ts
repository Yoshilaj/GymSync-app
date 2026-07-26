/**
 * Text chat with the coach over the voice WebSocket in text mode
 * (session_start with voice:false, session_id:null — no workout session, no
 * mic). User messages go up as {type:'message'}, replies stream back as
 * text_delta and finalize on done; app_action packets surface as inline
 * system chips in the transcript.
 *
 * Conversation persistence: the hook opts the socket into conversation mode
 * by always sending a `conversation_id` key (null = create lazily on first
 * message). The backend answers with `conversation_created`, whose id is
 * re-sent on every reconnect so context survives socket drops. Quick-action
 * pills inject a local assistant opener; its text rides up as
 * `starter_message` with the next handshake so the server can persist it as
 * the conversation's first turn. Against an older backend all of this
 * degrades to today's ephemeral behavior.
 *
 * The socket connects lazily on first send and reconnects on the next send
 * after a background disconnect, so a stale connection never makes chat look
 * broken.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { voiceSocketUrl } from './config';
import { VoiceSocket } from './VoiceSocket';
import { AppActionMessage, PlanProposalWire, ServerMessage } from './protocol';

/**
 * pending → the card shows Accept / Request changes;
 * accepting → Accept in flight; accepted → plan is live;
 * failed → Accept errored (retryable); superseded → a newer proposal replaced
 * this one (rendered dimmed/collapsed).
 */
export type ProposalStatus =
  | 'pending'
  | 'accepting'
  | 'accepted'
  | 'failed'
  | 'superseded';

export type ChatItem =
  | {
      kind: 'message';
      id: string;
      author: 'user' | 'sync';
      text: string;
      /** Epoch ms — locally stamped, or the server timestamp for hydrated turns. */
      createdAt: number;
      streaming?: boolean;
      failed?: boolean;
    }
  | { kind: 'action'; id: string; text: string; createdAt: number }
  | {
      kind: 'plan_proposal';
      id: string;
      createdAt: number;
      proposalId: string;
      plan: PlanProposalWire;
      status: ProposalStatus;
    };

/** A conversation_messages row as returned by GET /api/conversations/{id}. */
export interface ConversationMessageRow {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export type ChatConnectionState = 'idle' | 'connecting' | 'open';

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
  /** Socket lifecycle, for a truthful header status. */
  connectionState: ChatConnectionState;
  /** Server id of the conversation on screen; null until the first reply lands. */
  conversationId: string | null;
  /** Server-derived title, once known (conversation_created / hydrate). */
  conversationTitle: string | null;
  send: (text: string) => void;
  /** Re-send a failed user message. */
  retry: (id: string) => void;
  /**
   * Quick-action pill: show a bot opener locally without touching the
   * network. Replaces any previous un-replied-to opener.
   */
  injectStarter: (text: string) => void;
  /** Load a past conversation fetched over REST onto the screen. */
  hydrate: (conversationId: string, title: string | null, rows: ConversationMessageRow[]) => void;
  /** "New chat": clear the thread and detach from the current conversation. */
  reset: () => void;
  /**
   * Update a plan-proposal card's status (the accept POST itself lives in the
   * screen — API calls stay out of the socket hook).
   */
  setProposalStatus: (itemId: string, status: ProposalStatus) => void;
}

export function useTextChat({
  userId,
  getToken,
}: {
  userId: string;
  getToken: () => Promise<string>;
}): TextChatApi {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ChatConnectionState>('idle');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);

  const socketRef = useRef<VoiceSocket | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const pendingUserIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  // Read at handshake time (never closure-captured) so a mid-conversation
  // reconnect resumes the same server conversation instead of forking one.
  const conversationIdRef = useRef<string | null>(null);
  const pendingStarterRef = useRef<string | null>(null);
  const starterItemIdRef = useRef<string | null>(null);

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
              {
                kind: 'message',
                id,
                author: 'sync',
                text: msg.text,
                createdAt: Date.now(),
                streaming: true,
              },
            ];
          });
          break;
        }
        case 'conversation_created': {
          conversationIdRef.current = msg.conversation_id;
          pendingStarterRef.current = null;
          starterItemIdRef.current = null;
          if (mountedRef.current) {
            setConversationId(msg.conversation_id);
            setConversationTitle(msg.title);
          }
          break;
        }
        case 'app_action': {
          const text = actionText(msg);
          if (text) {
            setItems((prev) => [
              ...prev,
              { kind: 'action', id: uid('a'), text, createdAt: Date.now() },
            ]);
          }
          break;
        }
        case 'plan_proposal': {
          // A fresh proposal supersedes any prior pending card (mirrors the
          // server, which flips stale plan_proposals rows to superseded).
          setItems((prev) => [
            ...prev.map((it) =>
              it.kind === 'plan_proposal' && it.status === 'pending'
                ? { ...it, status: 'superseded' as const }
                : it,
            ),
            {
              kind: 'plan_proposal',
              id: uid('p'),
              createdAt: Date.now(),
              proposalId: msg.proposal_id,
              plan: msg.plan,
              status: 'pending',
            },
          ]);
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
    if (mountedRef.current) setConnectionState('idle');
  }, []);

  /** Connect + handshake once; reuse the open socket between turns. */
  const ensureConnected = useCallback(async (): Promise<VoiceSocket> => {
    const existing = socketRef.current;
    if (existing?.isOpen && readyRef.current) {
      await readyRef.current;
      return existing;
    }
    dropSocket();
    setConnectionState('connecting');

    const token = await getToken();
    let resolveReady!: () => void;
    let rejectReady!: (e: Error) => void;
    readyRef.current = new Promise<void>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    });

    const socket = new VoiceSocket(voiceSocketUrl(userId, token), {
      onOpen: () =>
        socket.send({
          type: 'session_start',
          session_id: null,
          voice: false,
          conversation_id: conversationIdRef.current,
          ...(pendingStarterRef.current
            ? { starter_message: pendingStarterRef.current }
            : null),
        }),
      onMessage: (msg) => {
        if (msg.type === 'ack') {
          if (msg.conversation_id) {
            conversationIdRef.current = msg.conversation_id;
            if (mountedRef.current) setConversationId(msg.conversation_id);
          }
          if (mountedRef.current) setConnectionState('open');
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
        if (mountedRef.current) setConnectionState('idle');
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
        { kind: 'message', id, author: 'user', text: trimmed, createdAt: Date.now() },
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

  const injectStarter = useCallback((text: string) => {
    const id = uid('st');
    pendingStarterRef.current = text;
    setItems((prev) => {
      // Only one un-replied opener at a time — tapping another pill swaps it.
      const withoutOld = starterItemIdRef.current
        ? prev.filter((it) => it.id !== starterItemIdRef.current)
        : prev;
      return [
        ...withoutOld,
        { kind: 'message', id, author: 'sync', text, createdAt: Date.now() },
      ];
    });
    starterItemIdRef.current = id;
  }, []);

  const hydrate = useCallback(
    (id: string, title: string | null, rows: ConversationMessageRow[]) => {
      // Detach from whatever socket/conversation was live; the next send
      // re-handshakes with the hydrated conversation's id.
      dropSocket();
      streamIdRef.current = null;
      pendingStarterRef.current = null;
      starterItemIdRef.current = null;
      conversationIdRef.current = id;
      setConversationId(id);
      setConversationTitle(title);
      setBusy(false);
      setError(null);
      setItems(
        rows.map((row) => ({
          kind: 'message',
          id: `h-${row.id}`,
          author: row.role === 'user' ? 'user' : 'sync',
          text: row.content,
          createdAt: Date.parse(row.created_at) || Date.now(),
        })),
      );
    },
    [dropSocket],
  );

  const setProposalStatus = useCallback(
    (itemId: string, status: ProposalStatus) => {
      setItems((prev) =>
        prev.map((it) =>
          it.kind === 'plan_proposal' && it.id === itemId ? { ...it, status } : it,
        ),
      );
    },
    [],
  );

  const reset = useCallback(() => {
    dropSocket();
    streamIdRef.current = null;
    pendingStarterRef.current = null;
    starterItemIdRef.current = null;
    conversationIdRef.current = null;
    setConversationId(null);
    setConversationTitle(null);
    setBusy(false);
    setError(null);
    setItems([]);
  }, [dropSocket]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  return {
    items,
    busy,
    error,
    connectionState,
    conversationId,
    conversationTitle,
    send,
    retry,
    injectStarter,
    hydrate,
    reset,
    setProposalStatus,
  };
}

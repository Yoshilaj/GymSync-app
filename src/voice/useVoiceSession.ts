import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { voiceSocketUrl } from './config';
import { VoiceSocket } from './VoiceSocket';
import { voiceMic, ensureMicAccess } from './VoiceMic';
import { voicePlayer } from './VoicePlayer';
import { MicGate } from './MicGate';
import { SileroVad } from './SileroVad';
import { AppActionMessage, ServerMessage, VoicePhase } from './protocol';

/** How long a non-fatal notice banner stays up before auto-clearing. */
const NOTICE_MS = 5000;
/** Delay before the single automatic reconnect after an unexpected close. */
const RECONNECT_DELAY_MS = 500;

export interface UseVoiceSessionArgs {
  /** Supabase user id — the {user_id} path segment on the voice socket. */
  userId: string;
  /** Returns a fresh Supabase JWT. Injected so this hook stays auth-agnostic. */
  getToken: () => Promise<string>;
  /** The user's utterance, as transcribed by the backend. */
  onTranscript?: (text: string) => void;
  /** A UI action (start_timer, log_set, swap_exercise, …) to apply to the screen. */
  onAppAction?: (action: AppActionMessage) => void;
  /**
   * Streamed assistant text. In voice mode this only arrives as the TTS-failure
   * fallback — render it so a voiceless turn still reaches the user.
   */
  onText?: (delta: string) => void;
}

export interface VoiceSessionApi {
  phase: VoicePhase;
  /** Fatal, session-ending error (dead-end until the user restarts). */
  error: string | null;
  /** Non-fatal, auto-clearing notice (e.g. "coach voice unavailable"). */
  notice: string | null;
  /** True while the VAD gate is open (the user is speaking). */
  speaking: boolean;
  /**
   * Smoothed mic level 0..1, driven per frame outside the render loop —
   * bind it to Animated styles (the orb), never read it in render.
   */
  micLevel: Animated.Value;
  /** The workout session this voice connection is attached to (if any). */
  sessionId: string | null;
  /**
   * Open the socket and start streaming mic audio. Pass the id of an existing
   * workout session to attach to it, or null/omit for a session-less chat.
   */
  start: (sessionId?: string | null) => Promise<void>;
  /**
   * Tear down mic, playback, and the socket. Does NOT touch the workout
   * session — that belongs to useWorkoutSession (muting the mic must never
   * end the workout).
   */
  stop: () => Promise<void>;
}

/**
 * Drives the voice *connection* lifecycle: WebSocket handshake, mic capture,
 * and coach-audio playback. Session ownership (create/end via REST) was split
 * out into useWorkoutSession — this hook only attaches to a session id.
 */
export function useVoiceSession({
  userId,
  getToken,
  onTranscript,
  onAppAction,
  onText,
}: UseVoiceSessionArgs): VoiceSessionApi {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const socketRef = useRef<VoiceSocket | null>(null);
  // Mic gate (Machine B) + its VAD. Created once per hook; reset per session.
  const gateRef = useRef<MicGate | null>(null);
  const vadLoadRef = useRef<Promise<SileroVad | null> | null>(null);
  const micLevel = useRef(new Animated.Value(0)).current;
  const phaseRef = useRef<VoicePhase>('idle');
  const mountedRef = useRef(true);
  const sessionIdRef = useRef<string | null>(null);
  // One automatic reconnect per outage; cleared when a fresh `ack` lands.
  const reconnectTriedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest callbacks in a ref so message handling never goes stale
  // and doesn't force the socket to be rebuilt when a parent re-renders.
  const callbacksRef = useRef({ onTranscript, onAppAction, onText });
  callbacksRef.current = { onTranscript, onAppAction, onText };

  // Set both the ref (for reads inside callbacks) and the state (for renders).
  const goto = useCallback((next: VoicePhase) => {
    // Leaving `listening` closes the mic gate: the current utterance is over
    // (or the session is), so the VAD forgets its state and `speaking` drops.
    if (phaseRef.current === 'listening' && next !== 'listening') {
      gateRef.current?.reset();
    }
    phaseRef.current = next;
    if (mountedRef.current) setPhase(next);
  }, []);

  // The gate is half-duplex Machine B: frames route through it only while
  // `listening`. Silero loads in the background; until it resolves the gate
  // runs in passthrough (continuous streaming), then upgrades in place.
  const ensureGate = useCallback((): MicGate => {
    if (!gateRef.current) {
      gateRef.current = new MicGate({
        send: (frames) => {
          const sock = socketRef.current;
          if (sock?.isOpen && phaseRef.current === 'listening') {
            for (const f of frames) sock.sendBinary(f);
          }
        },
        keepalive: () => {
          const sock = socketRef.current;
          if (sock?.isOpen && phaseRef.current === 'listening') {
            sock.send({ type: 'keepalive' });
          }
        },
        speakingChanged: (s) => {
          if (mountedRef.current) setSpeaking(s);
        },
        level: (v) => micLevel.setValue(v),
      });
    }
    if (!vadLoadRef.current) {
      vadLoadRef.current = SileroVad.load();
      void vadLoadRef.current.then((vad) => gateRef.current?.setVad(vad));
    }
    return gateRef.current;
  }, [micLevel]);

  const fail = useCallback(
    (message: string) => {
      if (mountedRef.current) setError(message);
      goto('error');
    },
    [goto],
  );

  // Non-fatal problem (TTS down, one turn lost): surface it without leaving
  // the session — the server always follows with `done`, so the phase machine
  // recovers on its own.
  const showNotice = useCallback((message: string) => {
    if (!mountedRef.current) return;
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null;
      if (mountedRef.current) setNotice(null);
    }, NOTICE_MS);
  }, []);

  // Start mic capture and route each PCM frame through the gate. Frames only
  // flow while Machine A is in `listening` (half-duplex: mic is "muted" during
  // thinking / coach_speaking); within `listening`, the VAD gate decides what
  // actually reaches the server.
  const startMic = useCallback(async () => {
    try {
      const granted = await ensureMicAccess();
      if (!granted) {
        fail('Microphone access is required to talk to your coach.');
        return;
      }
      if (!mountedRef.current || phaseRef.current === 'idle') return;
      const gate = ensureGate();
      voiceMic.start((frame) => {
        if (phaseRef.current !== 'listening') return;
        gate.pushFrame(frame);
      });
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Microphone failed to start');
    }
  }, [fail, ensureGate]);

  // Drain the coach's buffered audio for this turn, then return to listening.
  // Awaiting playback keeps the mic muted (half-duplex) until the coach is done.
  const finishTurn = useCallback(async () => {
    try {
      await voicePlayer.playTurn();
    } finally {
      // Don't override a deliberate stop() or an error that landed mid-playback.
      if (phaseRef.current !== 'idle' && phaseRef.current !== 'error') {
        goto('listening');
      }
    }
  }, [goto]);

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      const cb = callbacksRef.current;
      switch (msg.type) {
        case 'ack':
          // Handshake complete — go live and start streaming mic audio.
          reconnectTriedRef.current = false;
          goto('listening');
          void startMic();
          break;
        case 'transcript':
          // Backend heard a complete utterance; the agent is now working.
          goto('thinking');
          cb.onTranscript?.(msg.text);
          break;
        case 'app_action':
          // First reply artifact of the turn — the coach is responding.
          if (phaseRef.current === 'thinking') goto('coach_speaking');
          cb.onAppAction?.(msg);
          break;
        case 'text_delta':
          // Text-chat streaming, or the voice-mode TTS-failure text fallback.
          if (phaseRef.current === 'thinking') goto('coach_speaking');
          cb.onText?.(msg.text);
          break;
        case 'done':
          // Turn finished — play any buffered coach audio, then back to listening.
          void finishTurn();
          break;
        case 'error':
          // fatal:true = session dead. Anything else is a per-turn problem the
          // server recovers from (it follows with `done`) — just notify.
          if (msg.fatal) fail(msg.message);
          else showNotice(msg.message);
          break;
      }
    },
    [goto, fail, showNotice, startMic, finishTurn],
  );

  // Open a socket against the given session id. Extracted from start() so the
  // auto-reconnect path can bypass start()'s idle/error phase guard.
  const connect = useCallback(
    async (attachSessionId: string | null) => {
      goto('connecting');
      try {
        const token = await getToken();

        // A reconnect may still hold the dead socket — drop it first.
        socketRef.current?.close();

        const socket = new VoiceSocket(voiceSocketUrl(userId, token), {
          onOpen: () =>
            socket.send({
              type: 'session_start',
              session_id: attachSessionId,
              voice: true,
            }),
          onMessage: handleMessage,
          onBinary: (data) => {
            // First audio artifact of the turn → the coach is now speaking.
            if (phaseRef.current === 'thinking') goto('coach_speaking');
            voicePlayer.enqueue(data);
          },
          onError: () => {
            // The paired onClose carries the actionable signal (code, retry).
          },
          onClose: ({ code }) => {
            // Ignore closes after a deliberate stop() (phase already 'idle').
            if (phaseRef.current === 'idle') return;
            // 4001 = server rejected auth (token / user_id mismatch) — a retry
            // with the same token would just fail again.
            if (code === 4001) {
              fail('Authentication rejected (4001)');
              return;
            }
            // One automatic retry per outage, then give up visibly.
            if (!reconnectTriedRef.current) {
              reconnectTriedRef.current = true;
              goto('connecting');
              reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null;
                if (mountedRef.current && phaseRef.current !== 'idle') {
                  void connect(sessionIdRef.current);
                }
              }, RECONNECT_DELAY_MS);
              return;
            }
            fail(`Connection closed (${code})`);
          },
        });
        socketRef.current = socket;
        socket.connect();
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
    },
    [getToken, userId, handleMessage, goto, fail],
  );

  const start = useCallback(
    async (attachSessionId: string | null = null) => {
      if (phaseRef.current !== 'idle' && phaseRef.current !== 'error') return;
      if (mountedRef.current) {
        setError(null);
        setNotice(null);
        setSessionId(attachSessionId);
      }
      sessionIdRef.current = attachSessionId;
      reconnectTriedRef.current = false;
      // Kick off the Silero load now so it's usually ready by the first `ack`.
      ensureGate();
      await connect(attachSessionId);
    },
    [connect, ensureGate],
  );

  const stop = useCallback(async () => {
    const socket = socketRef.current;

    // Flip to idle first so socket.onClose treats this as intentional and the
    // mic frame handler stops forwarding bytes.
    goto('idle');

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectTriedRef.current = false;

    // Stop capturing and playback before tearing the socket down.
    gateRef.current?.reset();
    await voiceMic.stop();
    await voicePlayer.stop();

    if (socket) {
      try {
        if (socket.isOpen) socket.send({ type: 'session_end' });
      } catch {
        /* socket may already be gone */
      }
      socket.close();
    }
    socketRef.current = null;
    sessionIdRef.current = null;
    if (mountedRef.current) setSessionId(null);
  }, [goto]);

  // Tear down on unmount so a backgrounded screen doesn't leak the socket.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      gateRef.current?.dispose();
      gateRef.current = null;
      void voiceMic.stop();
      void voicePlayer.stop();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  return { phase, error, notice, speaking, micLevel, sessionId, start, stop };
}

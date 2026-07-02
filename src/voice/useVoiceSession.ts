import { useCallback, useEffect, useRef, useState } from 'react';
import { voiceConfig, voiceSocketUrl } from './config';
import { VoiceSocket } from './VoiceSocket';
import { voiceMic, ensureMicAccess } from './VoiceMic';
import { voicePlayer } from './VoicePlayer';
import { AppActionMessage, ServerMessage, VoicePhase } from './protocol';

export interface UseVoiceSessionArgs {
  /** Supabase user id — the {user_id} path segment on the voice socket. */
  userId: string;
  /** Returns a fresh Supabase JWT. Injected so this hook stays auth-agnostic. */
  getToken: () => Promise<string>;
  /** Optional plan to snapshot into the workout session. */
  planId?: string | null;
  /** The user's utterance, as transcribed by the backend. */
  onTranscript?: (text: string) => void;
  /** A UI action (start_timer, log_set, swap_exercise, …) to apply to the screen. */
  onAppAction?: (action: AppActionMessage) => void;
  /** Streamed assistant text (text-chat mode only; voice replies come as audio). */
  onText?: (delta: string) => void;
}

export interface VoiceSessionApi {
  phase: VoicePhase;
  error: string | null;
  sessionId: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Drives the voice session lifecycle. Milestone 1 scope: bootstrap the workout
 * session (REST), open the WebSocket, and complete the session_start/ack handshake.
 * Audio capture, VAD, and playback arrive in later milestones — see
 * docs/voice-client-plan.md.
 */
export function useVoiceSession({
  userId,
  getToken,
  planId = null,
  onTranscript,
  onAppAction,
  onText,
}: UseVoiceSessionArgs): VoiceSessionApi {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const socketRef = useRef<VoiceSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const phaseRef = useRef<VoicePhase>('idle');
  const mountedRef = useRef(true);

  // Keep the latest callbacks in a ref so message handling never goes stale
  // and doesn't force the socket to be rebuilt when a parent re-renders.
  const callbacksRef = useRef({ onTranscript, onAppAction, onText });
  callbacksRef.current = { onTranscript, onAppAction, onText };

  // Set both the ref (for reads inside callbacks) and the state (for renders).
  const goto = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhase(next);
  }, []);

  const fail = useCallback(
    (message: string) => {
      if (mountedRef.current) setError(message);
      goto('error');
    },
    [goto],
  );

  // Start mic capture and stream each PCM frame to the server. Frames are only
  // sent while Machine A is in `listening` (half-duplex: mic is "muted" during
  // thinking / coach_speaking). No VAD yet — this is the continuous M2 loop.
  const startMic = useCallback(async () => {
    try {
      const granted = await ensureMicAccess();
      if (!granted) {
        fail('Microphone access is required to talk to your coach.');
        return;
      }
      if (!mountedRef.current || phaseRef.current === 'idle') return;
      voiceMic.start((frame) => {
        if (phaseRef.current !== 'listening') return;
        const sock = socketRef.current;
        if (sock?.isOpen) sock.sendBinary(frame);
      });
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Microphone failed to start');
    }
  }, [fail]);

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
          // Text-chat mode only; in voice mode replies arrive as MP3 audio.
          if (phaseRef.current === 'thinking') goto('coach_speaking');
          cb.onText?.(msg.text);
          break;
        case 'done':
          // Turn finished — play any buffered coach audio, then back to listening.
          void finishTurn();
          break;
        case 'error':
          fail(msg.message);
          break;
      }
    },
    [goto, fail, startMic, finishTurn],
  );

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'error') return;
    if (mountedRef.current) setError(null);
    goto('connecting');

    try {
      const token = await getToken();
      tokenRef.current = token;

      // 1. Create a workout session (REST) — backend/app/routers/session.py.
      const res = await fetch(`${voiceConfig.apiBaseUrl}/api/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan_id: planId }),
      });
      if (!res.ok) {
        throw new Error(`Session create failed (HTTP ${res.status})`);
      }
      const data = (await res.json()) as { session: { id: string } };
      const sid = data.session.id;
      sessionIdRef.current = sid;
      if (mountedRef.current) setSessionId(sid);

      // 2. Open the voice WebSocket and perform the handshake.
      const socket = new VoiceSocket(voiceSocketUrl(userId, token), {
        onOpen: () =>
          socket.send({ type: 'session_start', session_id: sid, voice: true }),
        onMessage: handleMessage,
        onBinary: (data) => {
          // First audio artifact of the turn → the coach is now speaking.
          if (phaseRef.current === 'thinking') goto('coach_speaking');
          voicePlayer.enqueue(data);
        },
        onError: () => {
          if (phaseRef.current !== 'idle') fail('WebSocket error');
        },
        onClose: ({ code }) => {
          // Ignore closes after a deliberate stop() (phase already 'idle').
          if (phaseRef.current === 'idle') return;
          // 4001 = server rejected auth (token / user_id mismatch).
          fail(
            code === 4001
              ? 'Authentication rejected (4001)'
              : `Connection closed (${code})`,
          );
        },
      });
      socketRef.current = socket;
      socket.connect();
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
    }
  }, [getToken, planId, userId, handleMessage, goto, fail]);

  const stop = useCallback(async () => {
    const socket = socketRef.current;
    const sid = sessionIdRef.current;
    const token = tokenRef.current;

    // Flip to idle first so socket.onClose treats this as intentional and the
    // mic frame handler stops forwarding bytes.
    goto('idle');

    // Stop capturing and playback before tearing the socket down.
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

    // Best-effort: end the workout session server-side.
    if (sid && token) {
      try {
        await fetch(`${voiceConfig.apiBaseUrl}/api/session/${sid}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        /* ignore teardown errors */
      }
    }
    sessionIdRef.current = null;
    if (mountedRef.current) setSessionId(null);
  }, [goto]);

  // Tear down on unmount so a backgrounded screen doesn't leak the socket.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      void voiceMic.stop();
      void voicePlayer.stop();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  return { phase, error, sessionId, start, stop };
}

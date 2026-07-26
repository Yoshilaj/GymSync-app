import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState } from 'react-native';
import { voiceSocketUrl } from './config';
import { VoiceSocket } from './VoiceSocket';
import { voiceMic, ensureMicAccess, reassertAudioMode } from './VoiceMic';
import { voicePlayer } from './VoicePlayer';
import { MicGate } from './MicGate';
import { SileroVad } from './SileroVad';
import { LevelEmitter, type WaveformSource } from './levels';
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
  /** Raw mic waveform feed (4 × 16ms RMS buckets per frame) for VoiceWaveform. */
  micWaveform: WaveformSource;
  /** The workout session this voice connection is attached to (if any). */
  sessionId: string | null;
  /** User-requested mic mute (the dock toggle) — the session stays connected. */
  micMuted: boolean;
  /**
   * Mute/unmute the mic without touching the session: the recorder keeps
   * running (it holds the iOS audio session alive) but nothing recorded while
   * muted is ever sent — the gate drops the frames outright.
   */
  setMicMuted: (muted: boolean) => void;
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
  const [micMuted, setMicMutedState] = useState(false);

  const socketRef = useRef<VoiceSocket | null>(null);
  // Mic gate (Machine B) + its VAD. Created once per hook; reset per session.
  const gateRef = useRef<MicGate | null>(null);
  const vadLoadRef = useRef<Promise<SileroVad | null> | null>(null);
  const micLevel = useRef(new Animated.Value(0)).current;
  const micWaveform = useRef(new LevelEmitter()).current;
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
    // Half-duplex: the gate is muted in every phase except `listening`. Muting
    // (not resetting) keeps the pre-roll ring rolling, so words spoken just
    // before the phase flips back to listening still reach the server.
    gateRef.current?.setMuted(next !== 'listening');
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
        levelBuckets: (b) => micWaveform.emit(b),
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

  const setMicMuted = useCallback((muted: boolean) => {
    gateRef.current?.setUserMuted(muted);
    if (mountedRef.current) setMicMutedState(muted);
  }, []);

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

  // Stable frame handler shared by start, re-arm, and the watchdog. Stamps
  // the arrival time so a dead recorder (no frames) is detectable.
  const lastFrameAtRef = useRef(0);
  const handleFrame = useCallback((frame: ArrayBuffer) => {
    lastFrameAtRef.current = Date.now();
    gateRef.current?.pushFrame(frame);
  }, []);

  // Start mic capture and route EVERY frame through the gate, in all phases —
  // the gate's muted state (driven by goto) decides whether anything is sent.
  // Called during `connecting` so the native recorder spin-up overlaps the WS
  // handshake instead of eating the first words after "Listening" appears.
  const startMic = useCallback(async () => {
    try {
      const granted = await ensureMicAccess();
      if (!granted) {
        fail('Microphone access is required to talk to your coach.');
        return;
      }
      if (!mountedRef.current || phaseRef.current === 'idle') return;
      ensureGate();
      voiceMic.start(handleFrame);
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Microphone failed to start');
    }
  }, [fail, ensureGate, handleFrame]);

  // Coach playback (expo-audio players) reconfigures the shared iOS audio
  // session and can silently kill the recorder — re-assert the mode and
  // restart capture. Cheap (~100ms) and runs while the gate is phase-muted,
  // so the capture hole is invisible to the server.
  const rearmMic = useCallback(async () => {
    try {
      await reassertAudioMode();
      await voiceMic.restart(handleFrame);
    } catch (e) {
      console.warn('[useVoiceSession] mic re-arm failed', e);
    }
  }, [handleFrame]);

  // Drain the coach's remaining audio for this turn, re-arm the mic if any
  // playback disturbed the audio session, then return to listening. Awaiting
  // the drain keeps the mic muted (half-duplex) until the coach is done.
  const finishTurn = useCallback(async () => {
    try {
      const played = await voicePlayer.playTurn();
      if (played) await rearmMic();
    } finally {
      // Don't override a deliberate stop() or an error that landed mid-playback.
      if (phaseRef.current !== 'idle' && phaseRef.current !== 'error') {
        goto('listening');
      }
    }
  }, [goto, rearmMic]);

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
        case 'segment_end':
          // One complete MP3 (the ack, or a sentence) — play it now, while the
          // rest of the reply is still being generated.
          voicePlayer.endSegment();
          break;
        case 'done':
          // Turn finished — drain remaining coach audio, then back to listening.
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
      // Spin the mic up NOW (parallel with token fetch + WS handshake) so it's
      // already capturing when the ack flips us to `listening` — the gate is
      // muted until then, so nothing leaks early.
      void startMic();
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
    [getToken, userId, handleMessage, goto, fail, startMic],
  );

  const start = useCallback(
    async (attachSessionId: string | null = null) => {
      if (phaseRef.current !== 'idle' && phaseRef.current !== 'error') return;
      if (mountedRef.current) {
        setError(null);
        setNotice(null);
        setSessionId(attachSessionId);
        setMicMutedState(false); // fresh sessions always start unmuted
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
    if (mountedRef.current) {
      setSessionId(null);
      setMicMutedState(false); // gate.reset() above already cleared user mute
    }
  }, [goto]);

  // Watchdog: the per-turn re-arm covers playback-induced recorder death, but
  // an OS-level session steal (Siri, a call) can kill it at any time. On each
  // entry to `listening`, verify a frame actually arrived; if not, re-arm once.
  useEffect(() => {
    if (phase !== 'listening') return;
    const entered = Date.now();
    const t = setTimeout(() => {
      if (phaseRef.current !== 'listening') return;
      if (!voiceMic.isRunning) return; // startMic still in flight — don't race it
      if (AppState.currentState !== 'active') return; // backgrounded ≠ dead mic
      if (lastFrameAtRef.current >= entered) return; // frames flowing — healthy
      void rearmMic();
    }, 1200);
    return () => clearTimeout(t);
  }, [phase, rearmMic]);

  // Coming back from a suspension (phone call, Siri, a long lock without the
  // background-audio session) can outlive the single auto-reconnect — its 500ms
  // timer fires while the JS VM is still frozen. When the app is foregrounded
  // again with a dead session, quietly try once more.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (phaseRef.current === 'error' && sessionIdRef.current) {
        reconnectTriedRef.current = false;
        if (mountedRef.current) setError(null);
        void connect(sessionIdRef.current);
      }
    });
    return () => sub.remove();
  }, [connect]);

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

  return {
    phase,
    error,
    notice,
    speaking,
    micLevel,
    micWaveform,
    sessionId,
    micMuted,
    setMicMuted,
    start,
    stop,
  };
}

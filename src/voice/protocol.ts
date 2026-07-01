/**
 * Wire protocol with the backend voice WebSocket.
 * Source of truth: backend/app/routers/voice_ws.py (the docstring there is the contract).
 */

/** Client → Server control messages (JSON). Binary PCM frames are sent separately. */
export type ClientMessage =
  | { type: 'session_start'; session_id: string | null; voice: boolean }
  | { type: 'session_end' }
  | { type: 'message'; text: string };

/**
 * A UI-driving action the agent emitted (start_timer, log_set, swap_exercise, …).
 * Shape mirrors the app_action packets built in backend/app/agents/tools.py; the
 * fields beyond `action` vary per action, so they're left open.
 */
export interface AppActionMessage {
  type: 'app_action';
  action: string;
  [key: string]: unknown;
}

/** Server → Client messages (JSON). Binary MP3 frames arrive separately. */
export type ServerMessage =
  | { type: 'ack'; session_id: string | null; voice: boolean }
  | { type: 'transcript'; text: string }
  | { type: 'text_delta'; text: string }
  | AppActionMessage
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Conversation phase — "Machine A" from docs/voice-client-plan.md §5.
 * Milestone 1 only reaches idle | connecting | listening | error;
 * thinking | coach_speaking come online with the audio milestones.
 */
export type VoicePhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'coach_speaking'
  | 'error';

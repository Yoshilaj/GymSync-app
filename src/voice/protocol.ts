/**
 * Wire protocol with the backend voice WebSocket.
 * Source of truth: backend/app/routers/voice_ws.py (the docstring there is the contract).
 */

/** Client → Server control messages (JSON). Binary PCM frames are sent separately. */
export type ClientMessage =
  | { type: 'session_start'; session_id: string | null; voice: boolean }
  | { type: 'session_end' }
  | { type: 'message'; text: string };

/** A single change within a modify_plan action (backend tools.py: modify_plan). */
export interface PlanChange {
  op: 'add' | 'remove' | 'replace' | 'adjust';
  exercise_name?: string;
  to_exercise?: string;
  sets?: number;
  reps?: number;
  note?: string;
}

/**
 * The UI-driving actions the agent can emit. Each shape mirrors exactly the
 * app_action packets built in backend/app/agents/tools.py (execute_tool).
 *
 * This is a strict discriminated union so `switch (msg.action)` narrows each
 * field cleanly. The wire is untyped JSON cast to ServerMessage, so an action
 * the backend adds later still arrives at runtime — consumers handle the
 * unknown case with a `default` branch rather than the type system.
 */
export type AppActionMessage =
  | { type: 'app_action'; action: 'start_timer'; duration: number }
  | { type: 'app_action'; action: 'pause_timer' }
  | { type: 'app_action'; action: 'stop_timer' }
  | {
      type: 'app_action';
      action: 'log_set';
      exercise: string;
      reps: number;
      weight: number | null;
    }
  | { type: 'app_action'; action: 'add_exercise'; exercise: string }
  | { type: 'app_action'; action: 'swap_exercise'; from: string; to: string }
  | { type: 'app_action'; action: 'modify_plan'; changes: PlanChange[] };

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

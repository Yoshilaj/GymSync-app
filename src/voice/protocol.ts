/**
 * Wire protocol with the backend voice WebSocket.
 * Source of truth: backend/app/routers/voice_ws.py (the docstring there is the contract).
 */

/** Client → Server control messages (JSON). Binary PCM frames are sent separately. */
export type ClientMessage =
  | {
      type: 'session_start';
      session_id: string | null;
      voice: boolean;
      /**
       * Chat-tab conversation to resume, or null to lazily create one on the
       * first message. Omitted entirely by workout/voice sessions — presence
       * of the key is what opts a socket into conversation persistence.
       */
      conversation_id?: string | null;
      /** Bot-initiated opener (quick-action pill) to persist as the first assistant turn. */
      starter_message?: string;
    }
  | { type: 'session_end' }
  | { type: 'message'; text: string }
  /** VAD gate is closed (user silent) — keeps the server's Deepgram socket warm. */
  | { type: 'keepalive' };

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
  | { type: 'app_action'; action: 'modify_plan'; changes: PlanChange[] }
  | { type: 'app_action'; action: 'go_to_exercise'; exercise: string };

/** One exercise inside a proposed (not yet accepted) weekly plan. */
export interface PlanProposalExercise {
  exercise_id?: string | null;
  exercise_name: string;
  sets: number;
  reps_low: number;
  reps_high?: number;
  note?: string;
}

export interface PlanProposalDay {
  day_label: string;
  title: string;
  est_minutes?: number;
  exercises: PlanProposalExercise[];
}

/** The agent's proposed weekly plan, as carried by a plan_proposal frame. */
export interface PlanProposalWire {
  name: string;
  split_type: string;
  rationale: string;
  days: PlanProposalDay[];
}

/** Server → Client messages (JSON). Binary MP3 frames arrive separately. */
export type ServerMessage =
  | {
      type: 'ack';
      session_id: string | null;
      voice: boolean;
      /** Echoed for conversation-mode sockets; may be null before the first message. */
      conversation_id?: string | null;
    }
  | { type: 'transcript'; text: string }
  /** LLM streaming (text mode); in voice mode only as the TTS-failure text fallback. */
  | { type: 'text_delta'; text: string }
  | {
      /** Sent once, before the first text_delta, when a conversation is lazily created. */
      type: 'conversation_created';
      conversation_id: string;
      title: string;
    }
  | AppActionMessage
  /**
   * The agent proposed a weekly plan (propose_workout_plan tool). Nothing is
   * saved yet — the user must Accept via POST /api/plans/proposals/{id}/accept.
   */
  | {
      type: 'plan_proposal';
      proposal_id: string;
      plan: PlanProposalWire;
      warnings?: string[];
    }
  /**
   * Voice mode: the binary MP3 chunks received since the previous segment_end
   * form one complete, independently playable MP3 (the ack, or one sentence).
   * Play it immediately — don't wait for `done`. Older servers never send
   * this; the client then plays the whole buffered turn on `done` (legacy).
   */
  | { type: 'segment_end' }
  | { type: 'done' }
  /**
   * fatal:false = per-turn failure (e.g. TTS down), always followed by `done` —
   * the session continues. fatal:true = session dead, the socket closes after.
   * A missing `fatal` key (older server) is treated as non-fatal while the
   * socket stays open.
   */
  | { type: 'error'; message: string; fatal?: boolean };

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

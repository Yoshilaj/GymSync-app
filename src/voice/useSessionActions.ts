/**
 * App-action dispatch layer for the voice client (Milestone 4).
 *
 * Turns the `app_action` packets the agent emits (backend/app/agents/tools.py) into
 * live UI state for the voice screen: a rest timer that counts down, the list of sets
 * logged this session, and a feed of notable changes (swaps, added exercises, plan edits).
 *
 * The screen feeds every AppActionMessage in via `apply()`; this hook owns the derived
 * state and the timer's countdown so the screen stays declarative.
 */
import { useCallback, useEffect, useReducer } from 'react';
import { AppActionMessage } from './protocol';

export type TimerStatus = 'idle' | 'running' | 'paused';

export interface RestTimer {
  status: TimerStatus;
  /** Seconds left on the clock. */
  remaining: number;
  /** The duration the timer was started with, for progress display. */
  duration: number;
}

export interface LoggedSet {
  id: string;
  exercise: string;
  reps: number;
  weight: number | null;
}

/** A one-line notice for the activity feed (exercise swap, add, or plan edit). */
export interface SessionNotice {
  id: string;
  kind: 'swap' | 'add' | 'modify';
  text: string;
}

export interface SessionActionsState {
  timer: RestTimer;
  sets: LoggedSet[];
  notices: SessionNotice[];
}

const initialState: SessionActionsState = {
  timer: { status: 'idle', remaining: 0, duration: 0 },
  sets: [],
  notices: [],
};

// Internal reducer actions: an inbound app_action, a 1s tick, a reset, or a
// local timer control (screen-driven — Skip / +30s / pause / auto-rest).
type ReducerAction =
  | AppActionMessage
  | { type: 'tick' }
  | { type: 'reset' }
  | { type: 'local_rest_start'; duration: number }
  | { type: 'local_rest_skip' }
  | { type: 'local_rest_extend'; by: number }
  | { type: 'local_rest_toggle_pause' };

let noticeSeq = 0;
// Monotonic-ish id without pulling in a uuid dependency; unique within a session.
function uid(): string {
  noticeSeq += 1;
  return `${Date.now()}-${noticeSeq}`;
}

function reducer(
  state: SessionActionsState,
  action: ReducerAction,
): SessionActionsState {
  if (action.type === 'tick') {
    if (state.timer.status !== 'running') return state;
    const remaining = Math.max(0, state.timer.remaining - 1);
    return {
      ...state,
      timer: {
        ...state.timer,
        remaining,
        status: remaining === 0 ? 'idle' : 'running',
      },
    };
  }

  if (action.type === 'reset') return initialState;

  if (action.type === 'local_rest_start') {
    // Auto-rest on set completion must not stomp a timer the coach paused —
    // the coach's intent wins until the user or coach resumes/stops it.
    if (state.timer.status === 'paused') return state;
    return {
      ...state,
      timer: {
        status: 'running',
        remaining: action.duration,
        duration: action.duration,
      },
    };
  }

  if (action.type === 'local_rest_skip') {
    return { ...state, timer: { status: 'idle', remaining: 0, duration: 0 } };
  }

  if (action.type === 'local_rest_extend') {
    if (state.timer.status === 'idle') return state;
    return {
      ...state,
      timer: {
        ...state.timer,
        remaining: state.timer.remaining + action.by,
        duration: Math.max(state.timer.duration, state.timer.remaining + action.by),
      },
    };
  }

  if (action.type === 'local_rest_toggle_pause') {
    if (state.timer.status === 'idle') return state;
    return {
      ...state,
      timer: {
        ...state.timer,
        status: state.timer.status === 'paused' ? 'running' : 'paused',
      },
    };
  }

  switch (action.action) {
    case 'start_timer':
      return {
        ...state,
        timer: {
          status: 'running',
          remaining: action.duration,
          duration: action.duration,
        },
      };
    case 'pause_timer':
      return state.timer.status === 'running'
        ? { ...state, timer: { ...state.timer, status: 'paused' } }
        : state;
    case 'stop_timer':
      return { ...state, timer: { status: 'idle', remaining: 0, duration: 0 } };
    case 'log_set':
      return {
        ...state,
        sets: [
          ...state.sets,
          {
            id: uid(),
            exercise: action.exercise,
            reps: action.reps,
            weight: action.weight,
          },
        ],
      };
    case 'add_exercise':
      return {
        ...state,
        notices: [
          { id: uid(), kind: 'add', text: `Added ${action.exercise}` },
          ...state.notices,
        ],
      };
    case 'swap_exercise':
      return {
        ...state,
        notices: [
          {
            id: uid(),
            kind: 'swap',
            text: `Swapped ${action.from} → ${action.to}`,
          },
          ...state.notices,
        ],
      };
    case 'modify_plan':
      return {
        ...state,
        notices: [
          { id: uid(), kind: 'modify', text: "Updated today's plan" },
          ...state.notices,
        ],
      };
    default:
      // Unknown/most future actions carry no screen state — ignore.
      return state;
  }
}

export interface SessionActionsApi {
  state: SessionActionsState;
  /** Feed one app_action packet from the socket into the UI state. */
  apply: (action: AppActionMessage) => void;
  /** Clear everything (e.g. when the session ends). */
  reset: () => void;
  /** Local auto-rest (set completed). No-ops while the coach has it paused. */
  startRest: (duration: number) => void;
  skipRest: () => void;
  extendRest: (by?: number) => void;
  toggleRestPause: () => void;
}

export function useSessionActions(): SessionActionsApi {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Drive the countdown once per second while the timer is running.
  useEffect(() => {
    if (state.timer.status !== 'running') return;
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => clearInterval(id);
  }, [state.timer.status]);

  const apply = useCallback((action: AppActionMessage) => dispatch(action), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  const startRest = useCallback(
    (duration: number) => dispatch({ type: 'local_rest_start', duration }),
    [],
  );
  const skipRest = useCallback(() => dispatch({ type: 'local_rest_skip' }), []);
  const extendRest = useCallback(
    (by: number = 30) => dispatch({ type: 'local_rest_extend', by }),
    [],
  );
  const toggleRestPause = useCallback(
    () => dispatch({ type: 'local_rest_toggle_pause' }),
    [],
  );

  return { state, apply, reset, startRest, skipRest, extendRest, toggleRestPause };
}

/** Format seconds as M:SS for the timer display. */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

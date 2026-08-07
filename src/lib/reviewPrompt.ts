/**
 * When to ask for an App Store rating.
 *
 * iOS gives every app three rating prompts per user per 365 days and silently
 * swallows the rest — `requestReview()` always resolves, whether or not anything
 * appeared. So there is no feedback to react to, and the only thing that matters
 * is spending those three asks at moments the user feels good about the app.
 *
 * Finishing a workout is that moment: the session is done, the sets are logged,
 * and nothing is being interrupted. Every other entry point in the app is either
 * mid-task or somewhere a rating request would read as a shakedown.
 *
 * The count lives on the device rather than the server. There is no lifetime
 * workout total in the API (`/progress/summary` returns a streak and a per-week
 * count, not a total), and inventing one for this would be a lot of backend for
 * a counter that only ever gates a dialog.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, InteractionManager } from 'react-native';
import * as StoreReview from 'expo-store-review';

export const REVIEW_PROMPT_KEY = '@gymsync/review-prompt';

/** Bump when ReviewState changes shape incompatibly. */
const STATE_VERSION = 1;

/**
 * Which completed workouts trigger an ask.
 *
 * The first workout is a deliberate product call: it reaches everyone who
 * finishes anything, at the cost of asking before the user has really formed a
 * view. The two later milestones exist so that choice doesn't spend the whole
 * annual budget on the least-informed moment — someone who sticks around gets
 * asked again when they have far more to say.
 *
 * Editing this array is the whole knob. Nothing else needs to change.
 */
const MILESTONES = [1, 10, 25];

/** Never ask twice inside this window, whatever the milestones say. iOS would
 *  likely suppress it anyway, but burning an ask we can't see the result of is
 *  worse than skipping one. */
const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

/** Let the workout screen's dismissal finish before the sheet arrives.
 *  WorkoutSession is a fullScreenModal and StoreKit will not present over a
 *  view controller that is on its way out — the request is dropped, silently,
 *  and it still counts against the annual budget. */
const SETTLE_MS = 900;

interface ReviewState {
  version: number;
  completedWorkouts: number;
  lastPromptedAt: number | null;
  promptCount: number;
}

const EMPTY: ReviewState = {
  version: STATE_VERSION,
  completedWorkouts: 0,
  lastPromptedAt: null,
  promptCount: 0,
};

/** Read-and-validate. Anything unusable is treated as a fresh install — a
 *  corrupt counter must never be the reason a workout fails to end. */
async function readState(): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(REVIEW_PROMPT_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<ReviewState>;
    if (parsed.version !== STATE_VERSION || typeof parsed.completedWorkouts !== 'number') {
      return { ...EMPTY };
    }
    return {
      version: STATE_VERSION,
      completedWorkouts: parsed.completedWorkouts,
      lastPromptedAt: typeof parsed.lastPromptedAt === 'number' ? parsed.lastPromptedAt : null,
      promptCount: typeof parsed.promptCount === 'number' ? parsed.promptCount : 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

async function writeState(state: ReviewState): Promise<void> {
  try {
    await AsyncStorage.setItem(REVIEW_PROMPT_KEY, JSON.stringify(state));
  } catch {
    // A device that can't write this can still finish workouts.
  }
}

/**
 * Count a finished workout. Returns the new lifetime total.
 *
 * Called only from the real completion handler — leaving the workout screen
 * does not finish a workout, and must not count as one.
 */
export async function recordWorkoutCompleted(): Promise<number> {
  const state = await readState();
  const next = { ...state, completedWorkouts: state.completedWorkouts + 1 };
  await writeState(next);
  return next.completedWorkouts;
}

/**
 * Ask for a rating, if this is a moment worth spending one of the three on.
 *
 * Never throws and never returns anything useful — the OS does not tell us
 * whether the sheet appeared, so neither can we.
 */
export async function maybeAskForReview(completedWorkouts: number): Promise<void> {
  try {
    if (!MILESTONES.includes(completedWorkouts)) return;

    const state = await readState();
    if (state.lastPromptedAt !== null && Date.now() - state.lastPromptedAt < COOLDOWN_MS) {
      return;
    }

    // hasAction() covers both "this platform can do it" and "the store is
    // reachable" — on a simulator without a store build it returns false, which
    // is the correct answer rather than an error to swallow.
    if (!(await StoreReview.hasAction())) return;

    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => setTimeout(resolve, SETTLE_MS));
    });

    // Backgrounding between finishing the workout and the delay elapsing is
    // common — people put the phone down. Asking then wastes the request on a
    // sheet nobody sees.
    if (AppState.currentState !== 'active') return;

    await StoreReview.requestReview();
    await writeState({
      ...state,
      completedWorkouts,
      lastPromptedAt: Date.now(),
      promptCount: state.promptCount + 1,
    });
  } catch {
    // Asking for a review is the least important thing that happens after a
    // workout. Anything that goes wrong here is not worth surfacing.
  }
}

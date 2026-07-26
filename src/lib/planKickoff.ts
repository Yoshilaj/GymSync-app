/**
 * One-shot handoff from onboarding into chat: the final onboarding step
 * requests a kickoff; RootNavigator (freshly mounted when the gate flips)
 * reads the peek to open on the Sync tab, and SyncChatScreen consumes the
 * flag once to auto-send the first-plan request. Module state is fine here —
 * the flag's whole lifetime is a single gate flip.
 */
let pending = false;

export function requestPlanKickoff(): void {
  pending = true;
}

/** Non-destructive read (RootNavigator initialRouteName). */
export function peekPlanKickoff(): boolean {
  return pending;
}

/** Destructive read (SyncChatScreen on mount) — fires at most once. */
export function consumePlanKickoff(): boolean {
  const was = pending;
  pending = false;
  return was;
}

/** The auto-sent message that starts first-plan generation. */
export const PLAN_KICKOFF_MESSAGE =
  'Build my first weekly training plan from my profile.';

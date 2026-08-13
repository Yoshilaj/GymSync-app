/**
 * AsyncStorage keys shared across providers.
 *
 * PLAN_KEY lives here rather than in PlanContext because UserContext's
 * sign-out wipe needs it too, and importing it from PlanContext would create a
 * require cycle (PlanContext already imports useUser from UserContext).
 *
 * Per-account caches stored under these keys carry an `owner` field (the
 * account id) and MUST be validated against the signed-in account on read —
 * a previous account's data must never bleed into a fresh sign-in.
 */
export const PLAN_KEY = '@gymsync/plan';
export const PROGRESS_SUMMARY_KEY = '@gymsync/progress-summary';
export const PROGRESS_BODYWEIGHT_KEY = '@gymsync/progress-bodyweight';

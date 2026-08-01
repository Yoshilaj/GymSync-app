/**
 * Logging for the voice path, which is the one place in the app that chatters.
 *
 * Every one of these calls used to be a bare console.* that shipped to release
 * builds: invisible to us (nothing collects device console output) and pure cost
 * on the hot path. But deleting them would have thrown away the only trail that
 * explains a degraded voice session — VAD falling back, a segment dropped, the
 * mic failing to re-arm.
 *
 * So they split by kind. Diagnostics are dev-only. Degradations still print in
 * dev, and in release become Sentry breadcrumbs: they don't raise an issue by
 * themselves (they're handled — the session carries on), but if a crash follows,
 * the last twenty things the voice pipeline did arrive attached to it.
 */
import * as Sentry from '@sentry/react-native';

/** Dev-only diagnostic. Compiled out of release by the __DEV__ check. */
export function devLog(scope: string, message: string): void {
  if (__DEV__) console.log(`[${scope}] ${message}`);
}

/**
 * Something failed and we recovered. Not an error the user sees, and not an
 * issue on its own — context for whatever happens next.
 */
export function warnDegraded(scope: string, message: string, error?: unknown): void {
  if (__DEV__) console.warn(`[${scope}] ${message}`, error);
  Sentry.addBreadcrumb({
    category: 'voice',
    level: 'warning',
    message: `${scope}: ${message}`,
    data: error ? { error: String(error) } : undefined,
  });
}

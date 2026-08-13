/**
 * Startup configuration preflight.
 *
 * A production bundle bakes its `EXPO_PUBLIC_*` values in at build time; if one
 * is missing there, nothing at runtime can recover it. Build 3 shipped exactly
 * that way — the local .env never reaches EAS, and the env vars had never been
 * created on the EAS side — and the old module-scope throws in auth/supabase.ts
 * and voice/config.ts turned it into a blank white screen for App Review
 * (rejection 2.1a): they fired before Sentry.init and before React mounted, so
 * there was no error screen and no crash report.
 *
 * Defense now comes in layers, none of which can kill the bundle:
 *   1. tools/check-env.js fails the EAS build if a var is missing (pre-install hook).
 *   2. tools/verify-ipa-bundle.sh proves the values landed in the built IPA.
 *   3. This module lists what's missing so App.tsx can show ConfigErrorScreen —
 *      a visible, branded failure instead of a dead white screen — if a bad
 *      build ever escapes anyway.
 *
 * Reading process.env at module scope is safe: babel-preset-expo inlines each
 * `process.env.EXPO_PUBLIC_*` as a literal at bundle time, so these are string
 * or undefined — never a runtime lookup that could throw.
 */

export const missingConfig: string[] = [
  !process.env.EXPO_PUBLIC_SUPABASE_URL && 'EXPO_PUBLIC_SUPABASE_URL',
  !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY && 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  !process.env.EXPO_PUBLIC_API_URL && 'EXPO_PUBLIC_API_URL',
].filter(Boolean) as string[];

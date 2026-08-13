#!/usr/bin/env node
/**
 * Refuse to build a production app that's missing its environment.
 *
 * Runs on EAS as the `eas-build-pre-install` hook (see package.json scripts).
 * Build 3 shipped with none of its EXPO_PUBLIC_* vars — they lived only in the
 * gitignored local .env, which never reaches the EAS builder — and App Review
 * met a blank white screen (rejection 2.1a). The bundle bakes these values in
 * at build time, so build time is the last moment the mistake is cheap: fail
 * here, loudly, instead of shipping a binary that can't reach its own backend.
 *
 * Node built-ins only — this hook runs BEFORE `npm install`, so there are no
 * dependencies to import.
 */

const REQUIRED = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_SENTRY_DSN',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
];

/** These must point at real TLS endpoints — an http:// value in a store build
 * would be blocked by ATS and send voice audio in the clear. */
const HTTPS_ONLY = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_API_URL'];

const profile = process.env.EAS_BUILD_PROFILE ?? '(not an EAS build)';
// Preview builds are TestFlight rehearsals for production, so they get the
// same teeth. Development builds read a local .env and merely warn.
const enforce = profile === 'production' || profile === 'preview';

const missing = REQUIRED.filter((name) => !process.env[name]);
const insecure = HTTPS_ONLY.filter(
  (name) => process.env[name] && !process.env[name].startsWith('https://'),
);

if (missing.length === 0 && insecure.length === 0) {
  console.log(`[check-env] ok — all ${REQUIRED.length} vars present (profile: ${profile})`);
  process.exit(0);
}

const report = [
  missing.length > 0 && `missing: ${missing.join(', ')}`,
  insecure.length > 0 && `not https: ${insecure.join(', ')}`,
]
  .filter(Boolean)
  .join('; ');

if (enforce) {
  console.error(
    `[check-env] FAILING the ${profile} build — ${report}.\n` +
      '[check-env] Fix: create the vars for this environment on EAS ' +
      '(eas env:create --environment production --name <NAME> --value <VALUE>) ' +
      'and confirm the build profile in eas.json declares that "environment". ' +
      'See docs/DEPLOY.md.',
  );
  process.exit(1);
}

console.warn(`[check-env] warning (profile: ${profile}) — ${report}`);

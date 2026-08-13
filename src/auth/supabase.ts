import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { secureSessionStorage } from './secureStorage';

/**
 * Supabase client for the app. Credentials come from the environment
 * (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY) — see .env.example.
 * The session is encrypted at rest (see secureStorage.ts) and auto-refreshed, so
 * getToken() always returns a fresh JWT for the backend.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured && __DEV__) {
  // In development, warn and carry on: booting to the sign-in screen is more
  // useful than a crash while someone is still setting up their .env.
  //
  // This used to `throw` in release builds instead — "a build that can't sign
  // anyone in is not a build worth shipping quietly." Right instinct, fatal
  // mechanics: the throw fired at module evaluation, before Sentry.init and
  // before React mounted, so App Review saw a dead white screen and we saw
  // nothing at all (rejection 2.1a, build 3). The enforcement lives earlier in
  // the pipeline now — tools/check-env.js fails the EAS build outright — and at
  // runtime src/config/preflight.ts routes a misconfigured release build to a
  // visible ConfigErrorScreen instead of a corpse.
  console.warn(
    '[auth] Missing Supabase env — set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env, then restart Expo.',
  );
}

export const supabase = createClient(
  // Placeholders keep createClient from throwing on an empty URL. In a release
  // build this client is unreachable anyway: preflight.ts diverts a
  // misconfigured build to ConfigErrorScreen before any provider mounts.
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // no URL-based OAuth redirect in a native app
    },
  },
);

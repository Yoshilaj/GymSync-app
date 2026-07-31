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

if (!isSupabaseConfigured) {
  // In development, warn and carry on: booting to the sign-in screen is more
  // useful than a crash while someone is still setting up their .env.
  //
  // In a release build there is no .env to fix and no console to read it in — the
  // app would ship silently unable to authenticate anyone, every auth call failing
  // against a placeholder host. Refuse to start instead. A build that can't sign
  // anyone in is not a build worth shipping quietly.
  const message =
    '[auth] Missing Supabase env — set EXPO_PUBLIC_SUPABASE_URL and ' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env, then restart Expo.';
  if (__DEV__) console.warn(message);
  else throw new Error(message);
}

export const supabase = createClient(
  // Placeholders keep createClient from throwing on an empty URL in dev; the
  // release path above has already bailed by now.
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

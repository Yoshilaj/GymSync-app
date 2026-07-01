import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client for the app. Credentials come from the environment
 * (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY) — see .env.example.
 * The session is persisted in AsyncStorage and auto-refreshed, so getToken()
 * always returns a fresh JWT for the backend.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // Warn loudly, but still hand createClient valid-format placeholders so the
  // app boots to the sign-in screen instead of crashing (createClient throws on
  // an empty URL). Auth calls simply fail until real creds are set in .env.
  console.warn(
    '[auth] Missing Supabase env — set EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env, then restart Expo.',
  );
}

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // no URL-based OAuth redirect in a native app
  },
});

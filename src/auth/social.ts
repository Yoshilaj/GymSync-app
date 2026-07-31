/**
 * Apple and Google sign-in.
 *
 * Everything provider-specific lives here. Both paths end at the same place —
 * `supabase.auth.signInWithIdToken` — because both providers hand us an ID token
 * that Supabase can verify itself. That is why this is the one auth flow that does
 * NOT go through the backend proxy: the credential is minted by the OS on the
 * device, and shipping it to our server to forward would add a hop that can only
 * lose information.
 *
 * Configuration this needs (see docs/AUTH_SETUP.md):
 *   Supabase → Auth → Providers → Apple, with the bundle ID as the client ID.
 *   Supabase → Auth → Providers → Google, with the WEB client ID.
 *   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.
 *   app.json: ios.usesAppleSignIn, and the Google plugin's iosUrlScheme.
 */
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

export type SocialProvider = 'apple' | 'google';

export interface SocialResult {
  /** null on success. */
  error: string | null;
  /** True when the user backed out — show nothing at all, not an error. */
  cancelled?: boolean;
}

const CANCELLED: SocialResult = { error: null, cancelled: true };

export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

/** Apple's button may only be shown where Apple sign-in exists. */
export const isAppleAvailable = Platform.OS === 'ios';
export const isGoogleConfigured = Boolean(GOOGLE_IOS_CLIENT_ID && GOOGLE_WEB_CLIENT_ID);

let googleConfigured = false;
function configureGoogle(): void {
  if (googleConfigured) return;
  GoogleSignin.configure({
    // The WEB client id is what Supabase validates the ID token's audience
    // against. Passing only the iOS one yields a token Supabase rejects —
    // a confusing failure, because the native sheet succeeds first.
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });
  googleConfigured = true;
}

/**
 * A nonce binds the credential to this one sign-in attempt, so a token captured
 * elsewhere can't be replayed.
 *
 * The asymmetry is the part that trips people up: Apple wants the SHA-256 **hash**
 * and Supabase wants the **raw** value, so it can hash it itself and compare
 * against the claim inside the token. Send the same value to both and it fails.
 */
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const raw = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

function isCancellation(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return (
    code === 'ERR_REQUEST_CANCELED' ||
    code === 'ERR_CANCELED' ||
    code === statusCodes.SIGN_IN_CANCELLED
  );
}

/**
 * Apple hands back the user's name ONLY on the very first authorization, ever.
 * Sign out, delete the app, sign in again — it is gone and cannot be re-requested.
 * So it gets captured on that one chance and written to user metadata, which the
 * 014 trigger reads when it creates the profile row.
 */
export async function signInWithApple(): Promise<SocialResult> {
  try {
    const { raw, hashed } = await makeNonce();
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed,
    });

    if (!credential.identityToken) {
      return { error: "Apple didn't return a sign-in token. Try again." };
    }

    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: raw,
    });
    if (error) return { error: error.message };

    if (fullName) {
      // Best effort, and deliberately not awaited into the failure path: the user
      // is already signed in, and a missing display name is editable in Settings.
      void supabase.auth.updateUser({ data: { display_name: fullName } });
    }
    return { error: null };
  } catch (e) {
    if (isCancellation(e)) return CANCELLED;
    return { error: e instanceof Error ? e.message : 'Apple sign-in failed.' };
  }
}

export async function signInWithGoogle(): Promise<SocialResult> {
  if (!isGoogleConfigured) {
    return { error: 'Google sign-in is not configured for this build.' };
  }
  try {
    configureGoogle();
    await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();

    // v13+ returns a discriminated result rather than throwing on cancel.
    if (response.type === 'cancelled') return CANCELLED;

    const idToken = response.data?.idToken;
    if (!idToken) {
      return { error: "Google didn't return a sign-in token. Try again." };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    return { error: error?.message ?? null };
  } catch (e) {
    if (isCancellation(e)) return CANCELLED;
    return { error: e instanceof Error ? e.message : 'Google sign-in failed.' };
  }
}

export function signInWithProvider(provider: SocialProvider): Promise<SocialResult> {
  return provider === 'apple' ? signInWithApple() : signInWithGoogle();
}

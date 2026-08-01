/**
 * Voice client configuration — API + WebSocket endpoints.
 *
 * Set EXPO_PUBLIC_API_URL for a real backend (e.g. http://192.168.x.x:8000 so a
 * physical device can reach your machine). Falls back to localhost in development.
 */
const configuredUrl = process.env.EXPO_PUBLIC_API_URL;

if (!configuredUrl && !__DEV__) {
  // Same reasoning as auth/supabase.ts: in development the localhost fallback is
  // a convenience, but a release build has no .env to fix and no console to read
  // a warning in. Without this, a missing or misspelled EAS secret ships an app
  // that points at localhost:8000 on the phone itself — every request fails with
  // "Can't reach the server", which reads as an outage rather than a bad build.
  // Fail at launch, where it's unmissable, instead of on every screen.
  throw new Error(
    '[config] Missing EXPO_PUBLIC_API_URL. Set it as an EAS secret (or in .env) ' +
      'and rebuild — this build cannot reach the backend.',
  );
}

const API_URL = configuredUrl ?? 'http://localhost:8000';

export const voiceConfig = {
  apiBaseUrl: API_URL,
  // ws:// for http, wss:// for https — derived from the API scheme. An https base
  // therefore gives wss automatically; a plaintext http base in production would
  // send voice audio unencrypted, which is why the deployed URL must be https.
  wsBaseUrl: API_URL.replace(/^http/, 'ws'),
};

/** Build the voice WebSocket URL (see backend/app/routers/voice_ws.py).
 *
 * The token is deliberately NOT in the URL. Query strings get written to proxy and
 * access logs verbatim, which would scatter live bearer tokens across every hop
 * between the device and the server. It rides in the handshake instead — see
 * voiceSocketProtocols. */
export function voiceSocketUrl(userId: string): string {
  return `${voiceConfig.wsBaseUrl}/ws/voice/${encodeURIComponent(userId)}`;
}

/** Carry the access token in `Sec-WebSocket-Protocol`, the standard trick for
 * authenticating a WebSocket that can't set an Authorization header (the browser and
 * RN WebSocket APIs expose no header option). A JWT is base64url + '.', all of which
 * are legal subprotocol token characters, so it survives the handshake unescaped.
 * The server echoes back "bearer" to complete negotiation. */
export function voiceSocketProtocols(token: string): string[] {
  return ['bearer', token];
}

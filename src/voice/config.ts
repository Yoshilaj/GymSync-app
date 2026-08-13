/**
 * Voice client configuration — API + WebSocket endpoints.
 *
 * Set EXPO_PUBLIC_API_URL for a real backend (e.g. http://192.168.x.x:8000 so a
 * physical device can reach your machine). Falls back to localhost in development.
 */
const configuredUrl = process.env.EXPO_PUBLIC_API_URL;

/** False means this build points at the localhost fallback — fine on a dev
 * machine, useless on a customer's phone. Checked by src/config/preflight.ts. */
export const isApiConfigured = Boolean(configuredUrl);

if (!configuredUrl && !__DEV__) {
  // Same reasoning as auth/supabase.ts: in development the localhost fallback is
  // a convenience, but on a customer's phone it points every request at the
  // phone itself. This used to `throw` here so a bad build failed loudly — but a
  // module-scope throw fires before Sentry and before React, which is how App
  // Review met a blank white screen (rejection 2.1a, build 3). The build-time
  // check (tools/check-env.js) now refuses to produce such a build, and
  // src/config/preflight.ts surfaces the failure on screen if one ever escapes.
  console.error(
    '[config] Missing EXPO_PUBLIC_API_URL — this build cannot reach the backend.',
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

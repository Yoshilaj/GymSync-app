/**
 * Voice client configuration — API + WebSocket endpoints.
 *
 * Set EXPO_PUBLIC_API_URL for a real backend (e.g. http://192.168.x.x:8000 so a
 * physical device can reach your machine). Falls back to localhost for the simulator.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export const voiceConfig = {
  apiBaseUrl: API_URL,
  // ws:// for http, wss:// for https — derived from the API scheme.
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

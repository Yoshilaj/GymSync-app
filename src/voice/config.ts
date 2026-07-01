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

/** Build the authenticated voice WebSocket URL (see backend/app/routers/voice_ws.py). */
export function voiceSocketUrl(userId: string, token: string): string {
  const uid = encodeURIComponent(userId);
  const t = encodeURIComponent(token);
  return `${voiceConfig.wsBaseUrl}/ws/voice/${uid}?token=${t}`;
}

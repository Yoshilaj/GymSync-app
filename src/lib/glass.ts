import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

/**
 * Whether it's safe to render a native GlassView on this device.
 *
 * Two checks, both required:
 * - `isLiquidGlassAvailable()` — the device is on iOS 26+ with liquid glass.
 * - `isGlassEffectAPIAvailable()` — the *API* actually exists on this exact OS
 *   build. Expo added this because some iOS 26 point releases ship liquid
 *   glass without the API, and rendering GlassView there crashes
 *   (expo/expo#40911). App Review tests on the newest iOS, so this is exactly
 *   the population that hits it.
 *
 * Lazy and memoized rather than computed at module scope: `requireNativeModule`
 * inside these calls THROWS if the native module isn't registered, and a
 * module-scope throw kills the whole bundle before React mounts — a blank
 * white screen with no error report (see the build-3 rejection). Inside a
 * component body, a throw is caught here and, failing that, by ErrorBoundary.
 */
let cached: boolean | undefined;

export function glassAvailable(): boolean {
  if (cached === undefined) {
    try {
      cached = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
    } catch {
      // Missing/misbuilt native module — fall back to the blur path.
      cached = false;
    }
  }
  return cached;
}

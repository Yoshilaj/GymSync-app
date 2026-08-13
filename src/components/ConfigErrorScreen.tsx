import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';

/**
 * What renders when a release build is missing its baked-in configuration
 * (see src/config/preflight.ts). This screen exists so that failure mode is a
 * message a human can read and report — not the blank white screen App Review
 * rejected build 3 over.
 *
 * Deliberately primitive: no theme provider, no `@/components/ui` barrel (it
 * drags in Reanimated at module scope), no safe-area hooks — this mounts
 * INSTEAD of the provider tree, so it can depend on nothing. The background is
 * the same brand blue as the native splash, so the handoff doesn't flash.
 */
export function ConfigErrorScreen({ missing }: { missing: string[] }) {
  useEffect(() => {
    // Best effort — in the historical failure the Sentry DSN was missing too,
    // in which case init() disabled itself and this is a no-op. Harmless.
    Sentry.captureMessage(`[config] Build shipped without: ${missing.join(', ')}`, 'fatal');
  }, [missing]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>GymSync can’t start</Text>
      <Text style={styles.body}>
        This copy of the app was built without its server configuration, so it
        can’t sign anyone in. Please reinstall the app from the App Store — and
        if this keeps happening, contact support and mention this screen.
      </Text>
      <Text style={styles.code}>Missing: {missing.join(', ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#2E90EA', // brand blue — matches the native launch screen
    justifyContent: 'center',
    // Fixed padding instead of safe-area insets: no SafeAreaProvider exists on
    // this path, and centered content clears every notch anyway.
    paddingHorizontal: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 23,
    opacity: 0.92,
  },
  code: {
    color: '#FFFFFF',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    opacity: 0.6,
    marginTop: 16,
  },
});

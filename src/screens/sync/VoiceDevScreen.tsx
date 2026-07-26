import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { makeStyles, spacing, radius, useTheme } from '@/theme';
import { AppText, Button } from '@/components/ui';
import { useVoiceSession } from '@/voice';
import type { VoicePhase, ServerMessage } from '@/voice';

/**
 * Dev harness for the voice client (not shipped). Drives the real
 * useVoiceSession against tools/mock-voice-server.mjs so the state machine can
 * be watched without audio, Supabase, or the real backend. Run the mock first:
 *   node tools/mock-voice-server.mjs
 */
export function VoiceDevScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const phaseColor: Record<VoicePhase, string> = {
    idle: colors.textTertiary,
    connecting: colors.warning,
    listening: colors.accent,
    thinking: colors.warning,
    coach_speaking: colors.success,
    error: colors.danger,
  };
  const [log, setLog] = useState<string[]>([]);
  const append = useCallback((line: string) => {
    setLog((prev) => [...prev, line]);
  }, []);

  const { phase, error, sessionId, start, stop } = useVoiceSession({
    userId: 'dev-user',
    getToken: async () => 'dev-token',
    onTranscript: (text) => append(`transcript: "${text}"`),
    onAppAction: (a: Extract<ServerMessage, { type: 'app_action' }>) =>
      append(`app_action: ${a.action}`),
  });

  // Log every phase change once.
  const lastPhase = useRef<VoicePhase | null>(null);
  useEffect(() => {
    if (lastPhase.current !== phase) {
      lastPhase.current = phase;
      append(`→ ${phase}`);
    }
  }, [phase, append]);

  // Auto-start on mount so opening the screen exercises the flow.
  useEffect(() => {
    void start();
    return () => {
      void stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <AppText variant="label" style={styles.label}>
        Voice dev harness
      </AppText>

      <View style={styles.phaseBox}>
        <AppText variant="label">Phase</AppText>
        <AppText variant="stat" color={phaseColor[phase]} style={styles.phase}>
          {phase}
        </AppText>
        <AppText variant="caption" style={styles.meta}>
          session: {sessionId ?? '—'}
        </AppText>
        {error ? (
          <AppText variant="caption" color="dangerText" style={styles.metaTight}>
            error: {error}
          </AppText>
        ) : null}
      </View>

      <AppText variant="label" style={styles.label}>
        Event log
      </AppText>
      <ScrollView style={styles.logBox} contentContainerStyle={styles.logContent}>
        {log.length === 0 ? (
          <AppText variant="caption" color="textTertiary">
            waiting…
          </AppText>
        ) : (
          log.map((line, i) => (
            <Text key={i} style={styles.logLine}>
              {line}
            </Text>
          ))
        )}
      </ScrollView>

      <View style={styles.buttons}>
        <Button title="Start" icon="play" onPress={() => void start()} />
        <Button
          title="Stop"
          icon="stop"
          variant="secondary"
          onPress={() => void stop()}
        />
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.bg, padding: spacing.lg },
  label: { marginTop: spacing.md, marginBottom: spacing.sm },
  phaseBox: {
    backgroundColor: t.colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...t.shadows.sm,
  },
  phase: { marginTop: spacing.xs },
  meta: { marginTop: spacing.sm },
  metaTight: { marginTop: spacing.xs },
  logBox: {
    flex: 1,
    backgroundColor: t.colors.card,
    borderRadius: radius.lg,
    ...t.shadows.sm,
  },
  logContent: { padding: spacing.md },
  logLine: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: t.colors.textPrimary,
    marginBottom: 2,
  },
  buttons: { gap: spacing.sm, marginTop: spacing.md },
}));

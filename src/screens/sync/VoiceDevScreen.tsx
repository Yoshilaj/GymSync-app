import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '@/theme';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useVoiceSession } from '@/voice';
import type { VoicePhase, ServerMessage } from '@/voice';

/**
 * Dev harness for the voice client (not shipped). Drives the real
 * useVoiceSession against tools/mock-voice-server.mjs so the state machine can
 * be watched without audio, Supabase, or the real backend. Run the mock first:
 *   node tools/mock-voice-server.mjs
 */
const PHASE_COLOR: Record<VoicePhase, string> = {
  idle: colors.textDim,
  connecting: colors.warning,
  listening: colors.accent,
  thinking: colors.warning,
  coach_speaking: colors.success,
  error: colors.danger,
};

export function VoiceDevScreen() {
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
    start();
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <Text style={styles.label}>Voice dev harness</Text>

      <View style={styles.phaseBox}>
        <Text style={styles.phaseLabel}>PHASE</Text>
        <Text style={[styles.phase, { color: PHASE_COLOR[phase] }]}>{phase}</Text>
        <Text style={styles.meta}>session: {sessionId ?? '—'}</Text>
        {error ? <Text style={styles.error}>error: {error}</Text> : null}
      </View>

      <Text style={styles.label}>Event log</Text>
      <ScrollView style={styles.logBox} contentContainerStyle={styles.logContent}>
        {log.length === 0 ? (
          <Text style={styles.logDim}>waiting…</Text>
        ) : (
          log.map((line, i) => (
            <Text key={i} style={styles.logLine}>
              {line}
            </Text>
          ))
        )}
      </ScrollView>

      <View style={styles.buttons}>
        <PrimaryButton title="Start" icon="play" onPress={start} />
        <PrimaryButton
          title="Stop"
          icon="stop"
          variant="secondary"
          onPress={stop}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  label: { ...typography.label, marginTop: spacing.md, marginBottom: spacing.sm },
  phaseBox: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.lg,
  },
  phaseLabel: { ...typography.label },
  phase: { ...typography.stat, marginTop: spacing.xs },
  meta: { ...typography.caption, marginTop: spacing.sm },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  logBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  logContent: { padding: spacing.md },
  logLine: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: colors.text,
    marginBottom: 2,
  },
  logDim: { ...typography.caption, color: colors.textDim },
  buttons: { gap: spacing.sm, marginTop: spacing.md },
});

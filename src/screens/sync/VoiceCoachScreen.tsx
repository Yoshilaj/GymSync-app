import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '@/theme';
import { VoiceButton } from '@/components/VoiceButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/auth/AuthContext';
import { useUser } from '@/context/UserContext';
import {
  useVoiceSession,
  useSessionActions,
  formatClock,
  type VoicePhase,
  type AppActionMessage,
} from '@/voice';

// Phase → the big status line under the header.
const STATUS: Record<VoicePhase, string> = {
  idle: 'Tap to start',
  connecting: 'Connecting…',
  listening: 'Listening',
  thinking: 'Sync is thinking…',
  coach_speaking: 'Sync is speaking',
  error: 'Something went wrong',
};

// Phase → the hint under the mic button.
const HINT: Record<VoicePhase, string> = {
  idle: 'Tap the mic to start coaching',
  connecting: 'Reaching your coach…',
  listening: 'Talk to Sync — log sets, start timers, ask anything',
  thinking: 'Working on it…',
  coach_speaking: 'Listening to Sync…',
  error: 'Tap the mic to try again',
};

export function VoiceCoachScreen() {
  const nav = useNavigation();
  const { user: authUser, getToken } = useAuth();
  const { user } = useUser();
  const [transcript, setTranscript] = useState('');

  const actions = useSessionActions();
  const { state, apply, reset } = actions;

  const onAppAction = useCallback(
    (action: AppActionMessage) => apply(action),
    [apply],
  );

  const { phase, error, start, stop } = useVoiceSession({
    userId: authUser?.id ?? '',
    getToken,
    onTranscript: setTranscript,
    onAppAction,
  });

  // Auto-connect on open; tear down the session on close.
  const canStart = !!authUser?.id;
  useEffect(() => {
    if (!canStart) return;
    void start();
    return () => {
      void stop();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStart]);

  const live = phase !== 'idle' && phase !== 'error';

  const toggleMic = useCallback(() => {
    if (!canStart) return;
    if (live) void stop();
    else void start();
  }, [canStart, live, start, stop]);

  const endSession = useCallback(async () => {
    await stop();
    reset();
    nav.goBack();
  }, [stop, reset, nav]);

  const { timer, sets, notices } = state;
  const timerVisible = timer.status !== 'idle';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={typography.label}>Sync</Text>
        <Text style={styles.status}>{STATUS[phase]}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.micBlock}>
          <VoiceButton size={140} active={phase === 'listening'} onPress={toggleMic} />
          <Text style={styles.hint}>
            {phase === 'error' && error ? error : HINT[phase]}
          </Text>
        </View>

        {timerVisible && (
          <View style={styles.timerCard}>
            <Text style={typography.label}>Rest timer</Text>
            <Text style={styles.timerClock}>{formatClock(timer.remaining)}</Text>
            <Text style={typography.bodyMuted}>
              {timer.status === 'paused' ? 'Paused' : 'Resting'}
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={typography.label}>You said</Text>
          <Text style={[typography.body, styles.transcript]} numberOfLines={3}>
            {transcript || '—'}
          </Text>
        </View>

        {sets.length > 0 && (
          <View style={styles.card}>
            <Text style={typography.label}>Logged this session</Text>
            {sets.map((s) => (
              <View key={s.id} style={styles.setRow}>
                <Text style={styles.setName}>{s.exercise}</Text>
                <Text style={styles.setDetail}>
                  {s.weight != null
                    ? `${s.reps} × ${s.weight} ${user.units}`
                    : `${s.reps} reps`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {notices.length > 0 && (
          <View style={styles.notices}>
            {notices.map((n) => (
              <View key={n.id} style={styles.noticeChip}>
                <Text style={styles.noticeText}>{n.text}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.bottom}>
        <PrimaryButton
          title="End voice session"
          icon="close"
          variant="secondary"
          onPress={endSession}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  header: { alignItems: 'center', paddingTop: spacing.lg, gap: spacing.xs },
  status: { ...typography.heading, fontSize: 22 },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: spacing.lg, gap: spacing.md },
  micBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xl,
  },
  hint: { ...typography.bodyMuted, textAlign: 'center', paddingHorizontal: spacing.lg },
  timerCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  timerClock: {
    ...typography.stat,
    fontSize: 48,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  transcript: { marginTop: spacing.xs },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  setName: { ...typography.body },
  setDetail: { ...typography.bodyMuted },
  notices: { gap: spacing.sm },
  noticeChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  noticeText: { ...typography.caption, color: colors.accent },
  bottom: { paddingBottom: spacing.md, paddingTop: spacing.sm },
});

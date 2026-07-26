import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Button, Card, TimerDisplay } from '@/components/ui';
import { VoiceButton } from '@/components/VoiceButton';
import { VoiceWaveform } from '@/components/VoiceWaveform';
import { useAuth } from '@/auth/AuthContext';
import { useUser } from '@/context/UserContext';
import { usePlan } from '@/context/PlanContext';
import { fetchPersonality } from '@/api/personality';
import { fetchActiveSession } from '@/api/session';
import {
  useVoiceSession,
  useWorkoutSession,
  useSessionActions,
  voicePlayer,
  makeShimmerSource,
  type VoicePhase,
  type AppActionMessage,
} from '@/voice';

// Phase → the big status line under the orb.
const STATUS: Record<VoicePhase, string> = {
  idle: 'Tap to start',
  connecting: 'Connecting…',
  listening: 'Listening',
  thinking: 'Sync is thinking…',
  coach_speaking: 'Sync is speaking',
  error: 'Something went wrong',
};

// Phase → the hint under the status.
const HINT: Record<VoicePhase, string> = {
  idle: 'Tap the mic to start coaching',
  connecting: 'Reaching your coach…',
  listening: 'Talk to Sync — log sets, start timers, ask anything',
  thinking: 'Working on it…',
  coach_speaking: 'Listening to Sync…',
  error: 'Tap the mic to try again',
};

export function VoiceCoachScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const nav = useNavigation();
  const { user: authUser, getToken } = useAuth();
  const { user } = useUser();
  const [transcript, setTranscript] = useState('');
  // Coach reply as text — only populated when TTS is down (voice fallback).
  const [coachText, setCoachText] = useState('');
  const [personalityName, setPersonalityName] = useState<string | null>(null);
  // null = still checking; true = a session is already live elsewhere.
  const [blockedByActive, setBlockedByActive] = useState<boolean | null>(null);

  const actions = useSessionActions();
  const { state, apply, reset } = actions;

  const onAppAction = useCallback(
    (action: AppActionMessage) => apply(action),
    [apply],
  );

  // The workout session (REST) and the voice connection (socket) are owned
  // separately: mic-off only drops the socket, never the session.
  const { plan } = usePlan();
  // planId → the backend snapshots the real plan for the voice coach.
  const workout = useWorkoutSession({ getToken, planId: plan?.planId ?? null });

  // New utterance = new turn: clear any fallback text from the previous one.
  const onTranscript = useCallback((text: string) => {
    setTranscript(text);
    setCoachText('');
  }, []);

  const onText = useCallback(
    (delta: string) => setCoachText((prev) => prev + delta),
    [],
  );

  const { phase, error, notice, speaking, micWaveform, start, stop } =
    useVoiceSession({
      userId: authUser?.id ?? '',
      getToken,
      onTranscript,
      onAppAction,
      onText,
    });

  // "Thinking" shimmer: same waveform component, a synthetic slow-sine feed.
  const shimmer = useMemo(() => makeShimmerSource(), []);
  useEffect(() => () => shimmer.stop(), [shimmer]);

  const waveSource =
    phase === 'listening'
      ? micWaveform
      : phase === 'coach_speaking'
        ? voicePlayer.waveform
        : phase === 'thinking'
          ? shimmer
          : null;
  const waveColor =
    phase === 'listening'
      ? colors.live
      : phase === 'coach_speaking' || phase === 'thinking'
        ? colors.accent
        : colors.borderStrong;
  const waveActive =
    phase === 'listening' || phase === 'coach_speaking' || phase === 'thinking';

  const connect = useCallback(async () => {
    const sid = await workout.start();
    if (sid) await start(sid);
  }, [workout.start, start]);

  const canStart = !!authUser?.id;

  // Guard: the backend allows one active session per user. If a workout is
  // already live, don't silently hijack it — surface it instead.
  useEffect(() => {
    if (!canStart) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const active = await fetchActiveSession(token);
        if (!cancelled) setBlockedByActive(!!active);
      } catch {
        // Can't check (offline?) — proceed; connect() will surface real errors.
        if (!cancelled) setBlockedByActive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canStart, getToken]);

  // Best-effort personality name for the header.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const p = await fetchPersonality(token);
        if (!cancelled) setPersonalityName(p.name);
      } catch {
        /* header falls back to plain "Sync" */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  // Auto-connect once the guard clears; tear everything down on close.
  useEffect(() => {
    if (!canStart || blockedByActive !== false) return;
    void connect();
    return () => {
      void stop();
      void workout.end();
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStart, blockedByActive]);

  const live = phase !== 'idle' && phase !== 'error';

  const toggleMic = useCallback(() => {
    if (!canStart) return;
    if (live) void stop(); // mic off — the session stays active
    else void connect();
  }, [canStart, live, connect, stop]);

  const endSession = useCallback(async () => {
    await stop();
    await workout.end();
    reset();
    nav.goBack();
  }, [stop, workout.end, reset, nav]);

  const { timer, sets, notices } = state;

  // One chronological story: logged sets and notices merged, newest first.
  const feed = [
    ...sets.map((s) => ({
      id: s.id,
      icon: 'checkmark-circle' as const,
      text:
        s.weight != null
          ? `${s.exercise} — ${s.reps} × ${s.weight} ${user.units}`
          : `${s.exercise} — ${s.reps} reps`,
    })),
    ...notices.map((n) => ({
      id: n.id,
      icon: (n.kind === 'swap'
        ? 'swap-horizontal'
        : n.kind === 'add'
          ? 'add-circle'
          : 'document-text') as 'swap-horizontal' | 'add-circle' | 'document-text',
      text: n.text,
    })),
  ].sort((a, b) => (a.id < b.id ? 1 : -1));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Modal header */}
      <View style={styles.grabber} />
      <View style={styles.header}>
        <View style={{ width: 34 }} />
        <View style={styles.headerCenter}>
          <AppText variant="h3" align="center">
            Sync{personalityName ? ` · ${personalityName}` : ''}
          </AppText>
        </View>
        <Pressable onPress={endSession} hitSlop={8} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>

      {blockedByActive ? (
        <View style={styles.guard}>
          <View style={styles.guardIcon}>
            <Ionicons name="barbell" size={26} color={colors.accent} />
          </View>
          <AppText variant="h3" align="center">
            You're mid-workout
          </AppText>
          <AppText variant="caption" align="center" style={styles.guardHint}>
            A session is already running. Head back to it, or start fresh —
            starting fresh ends the current one.
          </AppText>
          <View style={styles.guardActions}>
            <Button
              title="Return to my session"
              onPress={() => nav.goBack()}
              variant="primary"
            />
            <Button
              title="Start fresh anyway"
              onPress={() => setBlockedByActive(false)}
              variant="ghost"
            />
          </View>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero zone — the voice, as a live waveform. */}
            <View style={styles.micBlock}>
              <VoiceWaveform
                source={waveSource}
                color={waveColor}
                active={waveActive}
                height={96}
              />
              <AppText variant="h2" align="center">
                {phase === 'listening' && speaking
                  ? 'Hearing you…'
                  : STATUS[phase]}
              </AppText>
              <AppText variant="caption" align="center" style={styles.hint}>
                {phase === 'error' && error ? error : HINT[phase]}
              </AppText>
              <VoiceButton
                size={72}
                active={phase === 'listening'}
                onPress={toggleMic}
              />
            </View>

            {/* Non-fatal problem (e.g. coach voice down) — auto-clears. */}
            {!!notice && (
              <View style={styles.noticeRow}>
                <Ionicons
                  name="information-circle"
                  size={16}
                  color={colors.warningText}
                />
                <AppText
                  variant="caption"
                  color="warningText"
                  style={{ flex: 1 }}
                >
                  {notice}
                </AppText>
              </View>
            )}

            {/* Live activity zone */}
            {timer.status !== 'idle' && (
              <Card style={styles.timerCard}>
                <TimerDisplay
                  seconds={timer.remaining}
                  label="Rest timer"
                  state={timer.status === 'paused' ? 'paused' : 'running'}
                />
              </Card>
            )}

            {!!transcript && (
              <View style={styles.quoteRow}>
                <View style={styles.quoteBar} />
                <AppText variant="caption" style={{ flex: 1 }} numberOfLines={3}>
                  “{transcript}”
                </AppText>
              </View>
            )}

            {/* Coach reply as text — the voiceless fallback when TTS is down. */}
            {!!coachText && (
              <View style={styles.quoteRow}>
                <View style={[styles.quoteBar, styles.coachBar]} />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <AppText variant="label">Sync</AppText>
                  <AppText variant="body">{coachText.trim()}</AppText>
                </View>
              </View>
            )}

            {feed.length > 0 ? (
              <Card padded={false} style={styles.feedCard}>
                <AppText variant="label" style={styles.feedHeading}>
                  Session activity
                </AppText>
                {feed.map((f) => (
                  <View key={f.id} style={styles.feedRow}>
                    <Ionicons name={f.icon} size={16} color={colors.successText} />
                    <AppText variant="body" style={{ flex: 1 }}>
                      {f.text}
                    </AppText>
                  </View>
                ))}
              </Card>
            ) : (
              phase === 'listening' && (
                <AppText variant="caption" align="center">
                  Try: “log 8 reps at 135 on bench”
                </AppText>
              )
            )}
          </ScrollView>

          <View style={styles.bottom}>
            <Button
              title="End session"
              icon="close"
              variant="secondary"
              onPress={endSession}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  safe: {
    flex: 1,
    backgroundColor: t.colors.bg,
    paddingHorizontal: layout.SCREEN_H_PADDING,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: t.colors.borderStrong,
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerCenter: { flex: 1 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: t.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: spacing.lg, gap: spacing.md },
  micBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  hint: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  timerCard: { alignItems: 'center' },
  quoteRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  quoteBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: t.colors.accentSoft,
  },
  coachBar: { backgroundColor: t.colors.successSoft },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: t.colors.warningSoft,
  },
  feedCard: { paddingVertical: spacing.sm },
  feedHeading: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bottom: { paddingBottom: spacing.md, paddingTop: spacing.sm },
  guard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  guardIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: t.colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  guardHint: { maxWidth: 280 },
  guardActions: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
}));

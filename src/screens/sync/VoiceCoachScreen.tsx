import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/theme';
import { VoiceButton } from '@/components/VoiceButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  voiceCoachTranscriptLines,
  voiceCoachCoachLines,
} from '@/data/mockChatHistory';
import { useUser } from '@/context/UserContext';

export function VoiceCoachScreen() {
  const nav = useNavigation();
  const { user } = useUser();
  const [listening, setListening] = useState(true);
  const [transcriptIndex, setTranscriptIndex] = useState(0);
  const [coachLine, setCoachLine] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!listening) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    setTranscriptIndex(0);
    setCoachLine(null);
    timer.current = setInterval(() => {
      setTranscriptIndex((i) => {
        const next = i + 1;
        if (next >= voiceCoachTranscriptLines.length) {
          const pool = voiceCoachCoachLines[user.coachPersonality];
          setCoachLine(pool[Math.floor(Math.random() * pool.length)]);
          if (timer.current) clearInterval(timer.current);
          return i;
        }
        return next;
      });
    }, 900);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [listening, user.coachPersonality]);

  const transcript = voiceCoachTranscriptLines
    .slice(0, transcriptIndex + 1)
    .join(' ');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Text style={typography.label}>Listening</Text>
        <Text style={styles.status}>
          {listening ? 'Counting reps…' : 'Paused'}
        </Text>
      </View>

      <View style={styles.middle}>
        <VoiceButton size={140} active={listening} onPress={() => setListening((v) => !v)} />
        <Text style={styles.hint}>
          {listening ? 'Tap to pause' : 'Tap to resume'}
        </Text>
      </View>

      <View style={styles.transcriptBox}>
        <Text style={typography.label}>Transcript</Text>
        <Text style={[typography.body, styles.transcript]} numberOfLines={3}>
          {transcript || '—'}
        </Text>
      </View>

      {coachLine && (
        <View style={styles.coachBox}>
          <Text style={[typography.label, { color: colors.accent }]}>Sync</Text>
          <Text style={[typography.title, { marginTop: spacing.xs }]}>
            {coachLine}
          </Text>
        </View>
      )}

      <View style={styles.bottom}>
        <PrimaryButton
          title="End voice session"
          icon="close"
          variant="secondary"
          onPress={() => nav.goBack()}
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
  top: { alignItems: 'center', paddingTop: spacing.xl, gap: spacing.xs },
  status: { ...typography.heading, fontSize: 22 },
  middle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  hint: { ...typography.bodyMuted },
  transcriptBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  transcript: { marginTop: spacing.xs },
  coachBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  bottom: { paddingBottom: spacing.md },
});

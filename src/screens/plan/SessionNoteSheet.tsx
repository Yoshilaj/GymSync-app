/**
 * "Something hurts" / "Leave a note" — telling the coach something mid-workout
 * without saying a word.
 *
 * Until this existed, the only way to report pain during a session was to talk to the
 * voice coach. That fails exactly when it matters most: a busy gym, voice switched off,
 * or simply not wanting to narrate your knee out loud to a room of strangers. The tapped
 * path records the same thing the spoken one does — the shared `record_injury` helper on
 * the server — so a plan is programmed around it either way.
 *
 * A sheet rather than a pushed screen: this interrupts a set, and the workout has to stay
 * visible behind it. RN `Modal` rather than an in-screen overlay, for the same reason
 * DeleteAccountDialog uses one — the session dock floats above screen content and an
 * in-screen scrim would leave it lit while everything else dimmed.
 */
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { layout, makeStyles, radius, spacing } from '@/theme';
import { AppText, Button, Chip, Input } from '@/components/ui';
import type { SessionNote, Severity } from '@/api/session';

/**
 * The areas people actually report, in roughly head-to-toe order. Deliberately short:
 * a wall of body parts is slower to scan than a free-text box, and anything not here
 * still reaches the coach through the note field.
 */
const BODY_PARTS = [
  'Neck',
  'Shoulder',
  'Elbow',
  'Wrist',
  'Upper back',
  'Lower back',
  'Hip',
  'Knee',
  'Ankle',
] as const;

const SEVERITIES: { id: Severity; label: string }[] = [
  { id: 'mild', label: 'Mild' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'severe', label: 'Severe' },
];

type Mode = 'injury' | 'comment';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Resolves once the note is recorded (or throws, so the caller can surface it). */
  onSubmit: (note: SessionNote) => Promise<void>;
}

export function SessionNoteSheet({ visible, onClose, onSubmit }: Props) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();

  const [mode, setMode] = useState<Mode>('injury');
  const [bodyPart, setBodyPart] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A reopened sheet starts clean — a stale body part from last time would be a
  // genuinely bad thing to submit by accident.
  useEffect(() => {
    if (visible) {
      setMode('injury');
      setBodyPart(null);
      setSeverity(null);
      setText('');
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  const enter = useSharedValue(0);
  useEffect(() => {
    if (!visible) {
      enter.value = 0;
      return;
    }
    enter.value = reduceMotion ? 1 : withTiming(1, { duration: 220 });
  }, [visible, reduceMotion, enter]);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 24 }],
  }));

  const canSubmit =
    !busy && (mode === 'injury' ? bodyPart !== null : text.trim().length > 0);

  const dismiss = () => {
    if (busy) return;
    onClose();
  };

  const submit = async () => {
    if (!canSubmit) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setError(null);
    try {
      await onSubmit(
        mode === 'injury'
          ? {
              kind: 'injury',
              bodyPart: bodyPart ?? undefined,
              severity: severity ?? undefined,
              text: text.trim(),
            }
          : { kind: 'comment', text: text.trim() },
      );
      onClose();
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : 'Could not save that. Try again.');
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.scrim}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.lift}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.sheet, sheetStyle]} accessibilityViewIsModal>
            <View style={styles.grabber} />

            <View style={styles.tabs}>
              <Chip
                label="Something hurts"
                icon="medkit-outline"
                selected={mode === 'injury'}
                onPress={() => setMode('injury')}
              />
              <Chip
                label="Leave a note"
                icon="create-outline"
                selected={mode === 'comment'}
                onPress={() => setMode('comment')}
              />
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {mode === 'injury' ? (
                <>
                  <AppText variant="label">Where</AppText>
                  <View style={styles.wrap}>
                    {BODY_PARTS.map((part) => (
                      <Chip
                        key={part}
                        label={part}
                        size="sm"
                        selected={bodyPart === part}
                        onPress={() => setBodyPart(bodyPart === part ? null : part)}
                      />
                    ))}
                  </View>

                  <AppText variant="label" style={styles.groupTop}>
                    How bad
                  </AppText>
                  <View style={styles.wrap}>
                    {SEVERITIES.map((s) => (
                      <Chip
                        key={s.id}
                        label={s.label}
                        size="sm"
                        selected={severity === s.id}
                        onPress={() => setSeverity(severity === s.id ? null : s.id)}
                      />
                    ))}
                  </View>

                  <Input
                    label="What happened (optional)"
                    icon="chatbubble-ellipses-outline"
                    placeholder="Sharp on the way down, fine coming up"
                    value={text}
                    onChangeText={setText}
                    multiline
                    containerStyle={styles.groupTop}
                  />
                </>
              ) : (
                <Input
                  label="Note"
                  icon="create-outline"
                  placeholder="Felt strong today — bar speed was quick on all three sets"
                  value={text}
                  onChangeText={setText}
                  multiline
                  autoFocus
                />
              )}

              {error && (
                <AppText variant="caption" color="dangerText" style={styles.groupTop}>
                  {error}
                </AppText>
              )}
            </ScrollView>

            <View style={styles.actions}>
              <Button
                title="Cancel"
                variant="ghost"
                full={false}
                onPress={dismiss}
                style={styles.action}
              />
              <Button
                title={busy ? 'Saving…' : 'Save'}
                variant="primary"
                full={false}
                disabled={!canSubmit}
                onPress={() => void submit()}
                style={styles.action}
              />
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: t.colors.scrimOverlay },
  lift: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: t.colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
    ...t.shadows.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: t.colors.border,
  },
  tabs: { flexDirection: 'row', gap: spacing.sm },
  body: { maxHeight: 320 },
  bodyContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  groupTop: { marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
}));

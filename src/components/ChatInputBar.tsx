import { RefObject, useEffect } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

/** Explicit so the multiline max-height is predictable rather than font-derived. */
const LINE_HEIGHT = 21;
const MAX_LINES = 5;

/** Soft expanding ring behind the mic while dictation is live. */
function MicPulse() {
  const styles = useStyles();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.45 }],
    opacity: 0.35 * (1 - pulse.value),
  }));

  return <Animated.View pointerEvents="none" style={[styles.micPulse, style]} />;
}

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** Toggles dictation (speech-to-text into the field) — never navigates. */
  onMicPress?: () => void;
  /** True while dictation is capturing; flips the mic into a stop button. */
  listening?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Bottom padding override — pass 0 when a parent owns the keyboard inset. */
  bottomInset?: number;
  /** Lets the screen focus the field (e.g. after a starter pill tap). */
  inputRef?: RefObject<TextInput | null>;
}

/** The floating chat input card pinned above the keyboard on the Sync tab. */
export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onMicPress,
  listening = false,
  placeholder = 'Ask Sync',
  autoFocus = false,
  bottomInset,
  inputRef,
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const canSend = !!value.trim();
  return (
    <View style={[styles.wrap, bottomInset != null && { paddingBottom: bottomInset }]}>
      <View style={styles.card}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={listening ? 'Listening…' : placeholder}
          placeholderTextColor={colors.textTertiary}
          onSubmitEditing={onSend}
          returnKeyType="send"
          autoFocus={autoFocus}
          // A single-line TextInput scrolls sideways instead of wrapping, so a
          // long message pushed everything you'd already typed off-screen.
          multiline
          // multiline defaults Return to inserting a newline; keep it sending,
          // which is what returnKeyType="send" already promises.
          submitBehavior="submit"
        />
        {onMicPress && (
          <View style={styles.micSlot}>
            {listening && <MicPulse />}
            <Pressable
              hitSlop={8}
              style={[styles.micBtn, listening && styles.micBtnActive]}
              onPress={onMicPress}
              accessibilityRole="button"
              accessibilityLabel={listening ? 'Stop dictation' : 'Dictate a message'}
            >
              <Ionicons
                name={listening ? 'stop' : 'mic'}
                size={18}
                color={listening ? colors.textInverse : colors.textPrimary}
              />
            </Pressable>
          </View>
        )}
        <Pressable
          hitSlop={8}
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Ionicons name="arrow-up" size={18} color={colors.textInverse} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    // Buttons stay pinned to the bottom as the field grows, rather than
    // drifting to the middle of a tall box.
    alignItems: 'flex-end',
    backgroundColor: t.colors.card,
    // Not `pill`: at one line this is visually identical (a 45pt-tall pill
    // clamps to ~22), but a 999 radius on a five-line box becomes a stadium
    // whose side curves eat the text.
    borderRadius: radius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    ...t.shadows.md,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: LINE_HEIGHT,
    fontFamily: 'Inter_400Regular',
    color: t.colors.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    // Grow to MAX_LINES, then scroll inside the field instead of shoving the
    // conversation off the top of the screen.
    maxHeight: LINE_HEIGHT * MAX_LINES + 16,
    // Android centres multiline text vertically; iOS already tops it.
    textAlignVertical: 'top',
  },
  micSlot: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micPulse: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: t.colors.accent,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.card,
  },
  micBtnActive: {
    backgroundColor: t.colors.accent,
    borderColor: t.colors.accent,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: t.colors.accentSoft },
}));

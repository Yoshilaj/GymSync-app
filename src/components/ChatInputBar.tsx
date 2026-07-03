import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadows, spacing } from '@/theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onMic?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Bottom padding override — pass tab-bar clearance when the bar is visible. */
  bottomInset?: number;
}

/** The floating chat input card shared by the Sync landing and conversation. */
export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onMic,
  placeholder = 'Ask Sync',
  autoFocus = false,
  bottomInset,
}: Props) {
  const canSend = !!value.trim();
  return (
    <View style={[styles.wrap, bottomInset != null && { paddingBottom: bottomInset }]}>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          onSubmitEditing={onSend}
          returnKeyType="send"
          autoFocus={autoFocus}
        />
        {onMic && (
          <Pressable hitSlop={8} style={styles.micBtn} onPress={onMic}>
            <Ionicons name="mic" size={18} color={colors.textPrimary} />
          </Pressable>
        )}
        <Pressable
          hitSlop={8}
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={!canSend}
        >
          <Ionicons name="arrow-up" size={18} color={colors.textInverse} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    ...shadows.md,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: colors.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.accentSoft },
});

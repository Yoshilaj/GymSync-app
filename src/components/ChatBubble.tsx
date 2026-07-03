import { View, StyleSheet } from 'react-native';
import { colors, radius, shadows, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import { ChatMessage } from '@/types';

interface Props {
  message: ChatMessage;
  /** Render a trailing cursor while the coach's reply is still streaming in. */
  streaming?: boolean;
}

export function ChatBubble({ message, streaming = false }: Props) {
  const isUser = message.author === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
      <View
        style={[styles.bubble, isUser ? styles.userBubble : styles.syncBubble]}
      >
        {!isUser && (
          <AppText variant="label" color="accentText" style={styles.authorLabel}>
            Sync
          </AppText>
        )}
        <AppText variant="body" color={isUser ? 'textInverse' : 'textPrimary'}>
          {message.text}
          {streaming ? <AppText variant="body" color="accentText">▍</AppText> : null}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  userBubble: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: spacing.xs,
  },
  syncBubble: {
    backgroundColor: colors.card,
    borderBottomLeftRadius: spacing.xs,
    ...shadows.xs,
  },
  authorLabel: {
    marginBottom: 4,
  },
});

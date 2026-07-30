/**
 * Chat turns, frontier-style: the coach's words ARE the page — bare prose at
 * full width, no bubble, no label. The user's message is a quiet right-aligned
 * chip. Rhythm does the separating that bubbles used to: lg after a user chip
 * (question → its answer), xl after coach prose (turn boundary).
 */
import { View } from 'react-native';
import { makeStyles, radius, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import { toPlainText } from '@/lib/plainText';
import { ChatMessage } from '@/types';

interface Props {
  message: ChatMessage;
  /** Render a trailing cursor while the coach's reply is still streaming in. */
  streaming?: boolean;
}

export function ChatBubble({ message, streaming = false }: Props) {
  const styles = useStyles();
  const isUser = message.author === 'user';

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userPill}>
          <AppText variant="body">{message.text}</AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      <AppText variant="body">
        {/* The coach is told not to emit markdown; this catches the slips. */}
        {toPlainText(message.text)}
        {streaming ? (
          <AppText variant="body" color="accentText">
            ▍
          </AppText>
        ) : null}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  assistantRow: {
    marginBottom: spacing.xl,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.lg,
  },
  userPill: {
    maxWidth: '78%',
    // White chip on the tinted light bg; elevated navy on dark — the quiet
    // ChatGPT-style user turn. Flat: no shadow, no border, no tail.
    backgroundColor: t.colors.card,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
}));

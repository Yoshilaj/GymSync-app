import { View } from 'react-native';
import { makeStyles, radius, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import { ChatMessage } from '@/types';

interface Props {
  message: ChatMessage;
  /** Render a trailing cursor while the coach's reply is still streaming in. */
  streaming?: boolean;
}

export function ChatBubble({ message, streaming = false }: Props) {
  const styles = useStyles();
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

const useStyles = makeStyles((t) => ({
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
    backgroundColor: t.colors.accent,
    borderBottomRightRadius: spacing.xs,
  },
  syncBubble: {
    backgroundColor: t.colors.card,
    borderBottomLeftRadius: spacing.xs,
    ...t.shadows.xs,
  },
  authorLabel: {
    marginBottom: 4,
  },
}));

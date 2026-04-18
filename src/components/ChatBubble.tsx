import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';
import { ChatMessage } from '@/types';

interface Props {
  message: ChatMessage;
}

export function ChatBubble({ message }: Props) {
  const isUser = message.author === 'user';
  return (
    <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.homieBubble,
        ]}
      >
        {!isUser && <Text style={styles.authorLabel}>Homie</Text>}
        <Text style={[typography.body, isUser && styles.userText]}>
          {message.text}
        </Text>
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
    backgroundColor: colors.userBubble,
    borderBottomRightRadius: spacing.xs,
  },
  homieBubble: {
    backgroundColor: colors.homieBubble,
    borderBottomLeftRadius: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userText: { color: '#fff' },
  authorLabel: {
    ...typography.label,
    color: colors.accent,
    marginBottom: 4,
  },
});

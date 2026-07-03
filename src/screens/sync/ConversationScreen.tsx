import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout, radius, spacing } from '@/theme';
import { AppText, Chip } from '@/components/ui';
import { ChatBubble } from '@/components/ChatBubble';
import { ChatInputBar } from '@/components/ChatInputBar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/auth/AuthContext';
import { useKeyboardVisible, useTabBarClearance } from '@/hooks';
import { useTextChat, type ChatItem } from '@/voice';
import { SyncStackParamList } from '@/navigation/SyncStack';

type Nav = NativeStackNavigationProp<SyncStackParamList, 'SyncConversation'>;
type RouteP = RouteProp<SyncStackParamList, 'SyncConversation'>;

const STARTERS = [
  "What's on today's plan?",
  'How much rest between heavy sets?',
  'Swap an exercise for me',
];

export function ConversationScreen() {
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<ChatItem>>(null);
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteP>();
  const { user: authUser, getToken } = useAuth();
  const clearance = useTabBarClearance();
  const keyboardVisible = useKeyboardVisible();

  const chat = useTextChat({
    userId: authUser?.id ?? '',
    getToken,
  });

  // A draft handed over from the Sync landing input sends immediately.
  useEffect(() => {
    const draft = route.params?.draft;
    if (draft) {
      chat.send(draft);
      nav.setParams({ draft: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.draft]);

  const handleSend = () => {
    chat.send(input);
    setInput('');
  };

  const scrollToEnd = () =>
    listRef.current?.scrollToEnd({ animated: true });

  const renderItem = ({ item }: { item: ChatItem }) => {
    if (item.kind === 'action') {
      return (
        <View style={styles.actionChipRow}>
          <View style={styles.actionChip}>
            <Ionicons name="checkmark-circle" size={14} color={colors.successText} />
            <AppText variant="caption" color="textSecondary">
              {item.text}
            </AppText>
          </View>
        </View>
      );
    }
    const bubble = (
      <ChatBubble
        message={{
          id: item.id,
          author: item.author,
          text: item.text,
          timestamp: '',
        }}
        streaming={item.streaming}
      />
    );
    if (!item.failed) return bubble;
    return (
      <Pressable onPress={() => chat.retry(item.id)}>
        {bubble}
        <AppText variant="caption" color="dangerText" style={styles.failedHint}>
          Message failed — tap to retry
        </AppText>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader
        variant="detail"
        title="Sync"
        subtitle={chat.busy ? 'typing…' : 'online'}
      />
      {chat.error && (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.warningText} />
          <AppText variant="caption" color="warningText">
            {chat.error} — reconnecting on your next message
          </AppText>
        </View>
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={layout.HEADER_KEYBOARD_OFFSET}
      >
        {chat.items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyOrb}>
              <Ionicons name="chatbubble-ellipses" size={26} color={colors.accent} />
            </View>
            <AppText variant="h3" align="center">
              Ask me anything about training
            </AppText>
            <AppText variant="caption" align="center" style={styles.emptyHint}>
              Plans, form, swaps, recovery — I know your history.
            </AppText>
            <View style={styles.starters}>
              {STARTERS.map((s) => (
                <Chip key={s} label={s} onPress={() => chat.send(s)} />
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={chat.items}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={scrollToEnd}
          />
        )}

        <ChatInputBar
          value={input}
          onChangeText={setInput}
          onSend={handleSend}
          onMic={() => nav.navigate('VoiceCoach')}
          placeholder="Message your Sync…"
          bottomInset={keyboardVisible ? spacing.sm : clearance.pinned}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  listContent: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingVertical: spacing.md,
  },
  actionChipRow: { alignItems: 'center', marginBottom: spacing.sm },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.successSoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 1,
    paddingHorizontal: spacing.md,
  },
  failedHint: { alignSelf: 'flex-end', marginBottom: spacing.sm },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    marginHorizontal: layout.SCREEN_H_PADDING,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyOrb: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyHint: { maxWidth: 260 },
  starters: {
    marginTop: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
});

import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/theme';
import { ChatBubble } from '@/components/ChatBubble';
import { VoiceButton } from '@/components/VoiceButton';
import { mockChatHistory, getScriptedReply } from '@/data/mockChatHistory';
import { useUser } from '@/context/UserContext';
import { ChatMessage } from '@/types';
import { SyncStackParamList } from '@/navigation/SyncStack';

type Nav = NativeStackNavigationProp<SyncStackParamList, 'SyncConversation'>;
type RouteP = RouteProp<SyncStackParamList, 'SyncConversation'>;

export function ConversationScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>(mockChatHistory);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteP>();
  const { user } = useUser();

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      author: 'user',
      text: trimmed,
      timestamp: new Date().toTimeString().slice(0, 5),
    };
    setMessages((m) => [...m, userMsg]);

    setTimeout(() => {
      const reply: ChatMessage = {
        id: `h-${Date.now()}`,
        author: 'sync',
        text: getScriptedReply(trimmed, user.coachPersonality),
        timestamp: new Date().toTimeString().slice(0, 5),
      };
      setMessages((m) => [...m, reply]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }, 600);

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  };

  useEffect(() => {
    const draft = route.params?.draft;
    if (draft) {
      sendMessage(draft);
      nav.setParams({ draft: undefined });
    }
  }, [route.params?.draft]);

  const handleSend = () => {
    sendMessage(input);
    setInput('');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={86}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <ChatBubble message={item} />}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: false })
          }
        />

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message your Sync…"
            placeholderTextColor={colors.textDim}
            multiline
            onSubmitEditing={handleSend}
          />
          <Pressable
            onPress={handleSend}
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            disabled={!input.trim()}
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </Pressable>
          <View style={{ marginLeft: spacing.sm }}>
            <VoiceButton size={44} onPress={() => nav.navigate('VoiceCoach')} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendBtnDisabled: { backgroundColor: colors.accentMuted, opacity: 0.6 },
});

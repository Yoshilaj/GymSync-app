import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Linking,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import {
  KeyboardAvoidingView,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from '@/components/ui';
import { ChatBubble } from '@/components/ChatBubble';
import { ChatInputBar } from '@/components/ChatInputBar';
import { ScrollToBottomButton } from '@/components/ScrollToBottomButton';
import { TypingDots } from '@/components/TypingDots';
import { useAuth } from '@/auth/AuthContext';
import { useConversations, useDictation, useTabBarClearance } from '@/hooks';
import { useUser } from '@/context/UserContext';
import { useTextChat, type ChatItem } from '@/voice';
import { ConversationSummary, fetchConversationThread } from '@/api/conversations';
import { acceptPlanProposal } from '@/api/plan';
import { consumePlanKickoff, PLAN_KICKOFF_MESSAGE } from '@/lib/planKickoff';
import { HistoryPanel } from './components/HistoryPanel';
import { PlanProposalCard } from './components/PlanProposalCard';
import { SyncEmptyState } from './components/SyncEmptyState';
import { Starter } from './starters';

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Morning';
  if (h < 18) return 'Afternoon';
  return 'Evening';
}

type ListRow = ChatItem | { kind: 'day'; id: string; label: string };

function dayLabel(d: Date, now: Date): string {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The whole Sync tab on one page: empty-state greeting fades into the message
 * thread in place — sending never navigates. The input bar rides the keyboard
 * via keyboard-controller (native-thread sync), with its resting padding
 * clearing the floating tab bar.
 */
export function SyncChatScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [input, setInput] = useState('');
  const nav = useNavigation();
  const kickoffDoneRef = useRef(false);
  const listRef = useRef<FlatList<ListRow>>(null);
  const inputRef = useRef<TextInput>(null);
  const { user } = useUser();
  const { user: authUser, getToken } = useAuth();
  const clearance = useTabBarClearance();

  const chat = useTextChat({
    userId: authUser?.id ?? '',
    getToken,
  });

  // Fresh from onboarding: auto-send the first-plan request exactly once.
  useEffect(() => {
    if (kickoffDoneRef.current) return;
    kickoffDoneRef.current = true;
    if (consumePlanKickoff()) {
      chat.send(PLAN_KICKOFF_MESSAGE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Conversation history panel ────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const history = useConversations(getToken);

  const openHistory = () => {
    void Haptics.selectionAsync();
    Keyboard.dismiss();
    setHistoryOpen(true);
    void history.refresh();
  };

  // A thread born on this device shows up at the top of the list immediately.
  useEffect(() => {
    if (chat.conversationId && chat.conversationTitle) {
      history.bump(chat.conversationId, chat.conversationTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.conversationId, chat.conversationTitle]);

  const handleSelectConversation = async (convo: ConversationSummary) => {
    setHistoryOpen(false);
    if (convo.id === chat.conversationId) return;
    setLoadingConversation(true);
    try {
      const token = await getToken();
      const thread = await fetchConversationThread(token, convo.id);
      chat.hydrate(convo.id, thread.conversation.title, thread.messages);
    } catch {
      Alert.alert('Could not open conversation', 'Check your connection and try again.');
    } finally {
      setLoadingConversation(false);
    }
  };

  const handleDeleteConversation = async (convo: ConversationSummary) => {
    try {
      await history.remove(convo.id);
      if (convo.id === chat.conversationId) chat.reset();
    } catch {
      // Row already restored by the hook; its error line explains.
    }
  };

  const handleNewChat = () => {
    setHistoryOpen(false);
    chat.reset();
    setInput('');
  };

  // Input bar bottom padding follows the keyboard's native animation:
  // tab-bar clearance at rest, snug spacing while typing.
  const { progress } = useReanimatedKeyboardAnimation();
  const inputInsetStyle = useAnimatedStyle(
    () => ({
      paddingBottom: interpolate(
        progress.value,
        [0, 1],
        [clearance.pinned, spacing.sm],
      ),
    }),
    [clearance.pinned],
  );

  // Inverted list: index 0 is the newest message, so streaming growth sticks
  // to the bottom without scrollToEnd timing hacks. Day separators appear
  // only once a thread spans more than "today".
  const listData = useMemo<ListRow[]>(() => {
    const now = new Date();
    const days = new Set(chat.items.map((i) => new Date(i.createdAt).toDateString()));
    const singleDayToday = days.size <= 1 && days.has(now.toDateString());

    const rows: ListRow[] = [];
    let lastDay: string | null = null;
    for (const item of chat.items) {
      const d = new Date(item.createdAt);
      const key = d.toDateString();
      if (!singleDayToday && key !== lastDay) {
        rows.push({ kind: 'day', id: `day-${key}`, label: dayLabel(d, now) });
        lastDay = key;
      }
      rows.push(item);
    }
    return rows.reverse();
  }, [chat.items]);

  // Streaming already renders its own bubble; dots only cover the gap before
  // the first token.
  const streamingActive = chat.items.some(
    (i) => i.kind === 'message' && i.streaming,
  );

  const [showJump, setShowJump] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async (item: ChatItem & { kind: 'message' }) => {
    await Clipboard.setStringAsync(item.text);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCopiedId(item.id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1200);
  };

  // A soft success tick when the agent performs an app action (log, swap…).
  const actionCountRef = useRef(0);
  useEffect(() => {
    const count = chat.items.filter((i) => i.kind === 'action').length;
    if (count > actionCountRef.current) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    actionCountRef.current = count;
  }, [chat.items]);

  // Dictation appends to whatever was already typed when the mic went live.
  const dictationBaseRef = useRef('');
  const applyTranscript = useCallback((transcript: string) => {
    const base = dictationBaseRef.current;
    setInput(base ? `${base} ${transcript}` : transcript);
  }, []);

  const dictation = useDictation({
    onPartial: applyTranscript,
    onFinal: applyTranscript,
    onDenied: () => {
      Alert.alert(
        'Microphone access needed',
        'Enable the microphone and speech recognition for GymSync in Settings to dictate messages.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      );
    },
  });

  const handleMicPress = () => {
    void Haptics.selectionAsync();
    if (dictation.state === 'idle') {
      dictationBaseRef.current = input.trim();
    }
    dictation.toggle();
  };

  // Leaving the tab (or pushing the voice modal) always releases the mic.
  useFocusEffect(
    useCallback(() => {
      return () => dictation.stop();
    }, [dictation.stop]),
  );

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dictation.stop();
    chat.send(input);
    setInput('');
  };

  const handleStarter = (starter: Starter) => {
    chat.injectStarter(starter.message);
    inputRef.current?.focus();
  };

  const handleAcceptProposal = useCallback(
    async (item: ChatItem & { kind: 'plan_proposal' }) => {
      chat.setProposalStatus(item.id, 'accepting');
      try {
        const token = await getToken();
        await acceptPlanProposal(token, item.proposalId);
        chat.setProposalStatus(item.id, 'accepted');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        chat.setProposalStatus(item.id, 'failed');
      }
    },
    [chat, getToken],
  );

  const handleRequestChanges = useCallback(() => {
    setInput("I'd like to change the plan: ");
    inputRef.current?.focus();
  }, []);

  const handleViewPlan = useCallback(() => {
    // Same tab-hop pattern PlanScreen uses in reverse ("Ask Sync").
    (nav.getParent() ?? nav).navigate('Plan' as never);
  }, [nav]);

  const status = chat.busy
    ? 'typing…'
    : chat.connectionState === 'open'
      ? 'online'
      : chat.connectionState === 'connecting'
        ? 'connecting…'
        : '';

  const renderItem = ({ item }: { item: ListRow }) => {
    if (item.kind === 'day') {
      return (
        <AppText variant="caption" color="textTertiary" align="center" style={styles.dayRow}>
          {item.label}
        </AppText>
      );
    }
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
    if (item.kind === 'plan_proposal') {
      return (
        <View style={styles.proposalRow}>
          <PlanProposalCard
            plan={item.plan}
            status={item.status}
            onAccept={() => void handleAcceptProposal(item)}
            onRequestChanges={handleRequestChanges}
            onViewPlan={handleViewPlan}
          />
        </View>
      );
    }
    return (
      <Pressable
        onPress={item.failed ? () => chat.retry(item.id) : undefined}
        onLongPress={() => void handleCopy(item)}
        delayLongPress={350}
      >
        <ChatBubble
          message={{
            id: item.id,
            author: item.author,
            text: item.text,
            timestamp: '',
          }}
          streaming={item.streaming}
        />
        {item.failed && (
          <AppText variant="caption" color="dangerText" style={styles.failedHint}>
            Message failed — tap to retry
          </AppText>
        )}
        {copiedId === item.id && (
          <AppText
            variant="caption"
            color="textTertiary"
            style={item.author === 'user' ? styles.copiedRight : styles.copiedLeft}
          >
            Copied
          </AppText>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerSlot}>
          <Pressable
            hitSlop={8}
            style={styles.headerBtn}
            onPress={openHistory}
            accessibilityRole="button"
            accessibilityLabel="Conversation history"
          >
            <View style={styles.menuGlyph}>
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
              <View style={styles.menuLine} />
            </View>
          </Pressable>
        </View>
        <View style={styles.headerCenter}>
          <AppText variant="h3" align="center" numberOfLines={1}>
            Sync
          </AppText>
          {status ? (
            <AppText variant="caption" align="center" numberOfLines={1}>
              {status}
            </AppText>
          ) : null}
        </View>
        <View style={[styles.headerSlot, styles.headerSlotRight]} />
      </View>

      {chat.error && (
        <View style={styles.errorBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.warningText} />
          <AppText variant="caption" color="warningText">
            {chat.error} — reconnecting on your next message
          </AppText>
        </View>
      )}

      <KeyboardAvoidingView behavior="padding" style={styles.flex} keyboardVerticalOffset={0}>
        {chat.items.length === 0 && !loadingConversation ? (
          <Animated.View
            style={[styles.flex, styles.emptyWrap]}
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(180)}
          >
            <SyncEmptyState
              greeting={`${timeGreeting()}, ${user.displayName}`}
              onStarter={handleStarter}
            />
          </Animated.View>
        ) : (
          <Animated.View style={styles.flex} entering={FadeIn.duration(180)}>
            <FlatList
              ref={listRef}
              data={listData}
              inverted
              keyExtractor={(m) => m.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                chat.busy && !streamingActive ? <TypingDots /> : null
              }
              onScroll={(e) => setShowJump(e.nativeEvent.contentOffset.y > 240)}
              scrollEventThrottle={64}
            />
            {showJump && (
              <ScrollToBottomButton
                onPress={() =>
                  listRef.current?.scrollToOffset({ offset: 0, animated: true })
                }
              />
            )}
          </Animated.View>
        )}

        <Animated.View style={inputInsetStyle}>
          <ChatInputBar
            inputRef={inputRef}
            value={input}
            onChangeText={setInput}
            onSend={handleSend}
            onMicPress={handleMicPress}
            listening={dictation.state !== 'idle'}
            placeholder="Message your Sync…"
            bottomInset={0}
          />
        </Animated.View>
      </KeyboardAvoidingView>

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        conversations={history.items}
        loading={history.loading}
        error={history.error}
        activeId={chat.conversationId}
        onSelect={handleSelectConversation}
        onDelete={handleDeleteConversation}
        onNewChat={handleNewChat}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    minHeight: 52,
  },
  headerSlot: { width: 34 },
  headerSlotRight: { alignItems: 'flex-end' },
  headerCenter: { flex: 1, gap: spacing.xxs },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: t.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  menuGlyph: { gap: 3.5 },
  menuLine: {
    width: 14,
    height: 1.6,
    borderRadius: 1,
    backgroundColor: t.colors.textPrimary,
  },
  emptyWrap: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
  },
  listContent: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingVertical: spacing.md,
  },
  actionChipRow: { alignItems: 'center', marginBottom: spacing.sm },
  proposalRow: { marginBottom: spacing.sm },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: t.colors.successSoft,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 1,
    paddingHorizontal: spacing.md,
  },
  failedHint: { alignSelf: 'flex-end', marginBottom: spacing.sm },
  dayRow: { marginVertical: spacing.md },
  copiedLeft: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  copiedRight: { alignSelf: 'flex-end', marginBottom: spacing.sm },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: t.colors.warningSoft,
    marginHorizontal: layout.SCREEN_H_PADDING,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
}));

import { useEffect, useMemo } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from '@/components/ui';
import { ConversationSummary } from '@/api/conversations';

interface Props {
  open: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  loading: boolean;
  error: string | null;
  /** Conversation currently on the chat screen, if any. */
  activeId: string | null;
  onSelect: (conversation: ConversationSummary) => void;
  onDelete: (conversation: ConversationSummary) => void;
  onNewChat: () => void;
}

type Row =
  | { type: 'header'; key: string; label: string }
  | { type: 'convo'; key: string; convo: ConversationSummary };

const DAY_MS = 24 * 60 * 60 * 1000;

function groupLabel(updatedAt: string, now: Date): string {
  const d = new Date(updatedAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= startOfToday) return 'Today';
  if (d.getTime() >= startOfToday.getTime() - 7 * DAY_MS) return 'Previous 7 days';
  if (d.getTime() >= startOfToday.getTime() - 30 * DAY_MS) return 'Previous 30 days';
  return 'Older';
}

function relativeLabel(updatedAt: string, now: Date): string {
  const d = new Date(updatedAt);
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return 'Just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < DAY_MS && d.getDate() === now.getDate()) {
    return `${Math.floor(diffMs / 3_600_000)}h ago`;
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * ChatGPT-style history: a left slide-in glass panel over the chat. Custom
 * (reanimated + gesture-handler) rather than a drawer library — swipe or tap
 * the scrim to close, long-press a row to delete.
 */
export function HistoryPanel({
  open,
  onClose,
  conversations,
  loading,
  error,
  activeId,
  onSelect,
  onDelete,
  onNewChat,
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(320, width * 0.78);

  // translate: -panelWidth (hidden) → 0 (open); the pan gesture drags it.
  const translate = useSharedValue(-panelWidth);

  // A calm, bounce-free glide in and out — no spring overshoot.
  useEffect(() => {
    translate.value = withTiming(open ? 0 : -panelWidth, {
      duration: open ? 260 : 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [open, panelWidth, translate]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translate.value, [-panelWidth, 0], [0, 0.35]),
  }));

  const pan = Gesture.Pan()
    .enabled(open)
    .activeOffsetX([-12, 12])
    .onChange((e) => {
      translate.value = Math.min(0, Math.max(-panelWidth, e.translationX));
    })
    .onEnd(() => {
      if (translate.value < -panelWidth / 3) {
        runOnJS(onClose)();
      } else {
        translate.value = withTiming(0, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const rows = useMemo<Row[]>(() => {
    const now = new Date();
    const out: Row[] = [];
    let lastGroup: string | null = null;
    for (const convo of conversations) {
      const label = groupLabel(convo.updated_at, now);
      if (label !== lastGroup) {
        out.push({ type: 'header', key: `h-${label}`, label });
        lastGroup = label;
      }
      out.push({ type: 'convo', key: convo.id, convo });
    }
    return out;
  }, [conversations]);

  const confirmDelete = (convo: ConversationSummary) => {
    Alert.alert('Delete conversation?', convo.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(convo) },
    ]);
  };

  const renderRow = ({ item }: { item: Row }) => {
    if (item.type === 'header') {
      return (
        <AppText variant="label" color="textTertiary" style={styles.groupHeader}>
          {item.label}
        </AppText>
      );
    }
    const now = new Date();
    const active = item.convo.id === activeId;
    return (
      <Pressable
        onPress={() => onSelect(item.convo)}
        onLongPress={() => confirmDelete(item.convo)}
        accessibilityRole="button"
        accessibilityLabel={`Open conversation: ${item.convo.title}`}
        style={({ pressed }) => [
          styles.row,
          active && styles.rowActive,
          pressed && styles.rowPressed,
        ]}
      >
        <View style={styles.rowText}>
          <AppText variant="bodyMedium" numberOfLines={1}>
            {item.convo.title}
          </AppText>
          <AppText variant="caption" color="textTertiary">
            {relativeLabel(item.convo.updated_at, now)}
          </AppText>
        </View>
      </Pressable>
    );
  };

  const panelContent = (
    <View style={[styles.panelInner, { paddingTop: insets.top + spacing.md }]}>
      <Pressable
        onPress={onNewChat}
        accessibilityRole="button"
        accessibilityLabel="Start a new chat"
        style={({ pressed }) => [styles.newChat, pressed && styles.rowPressed]}
      >
        <Ionicons name="create-outline" size={18} color={colors.textPrimary} />
        <AppText variant="bodyMedium">New chat</AppText>
      </Pressable>

      {error ? (
        <AppText variant="caption" color="warningText" style={styles.stateNote}>
          {error}
        </AppText>
      ) : null}

      {!loading && !error && conversations.length === 0 ? (
        <AppText variant="caption" color="textTertiary" style={styles.stateNote}>
          Conversations you start will show up here for 90 days.
        </AppText>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? 'auto' : 'none'}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close history"
        />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.panel, { width: panelWidth }, panelStyle]}>
          {Platform.OS === 'ios' ? (
            <BlurView tint="light" intensity={90} style={styles.surface}>
              <View style={[StyleSheet.absoluteFill, styles.frostVeil]} />
              {panelContent}
            </BlurView>
          ) : (
            <View style={[styles.surface, styles.solid]}>{panelContent}</View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  scrim: { backgroundColor: '#000' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  surface: { flex: 1 },
  frostVeil: { backgroundColor: 'rgba(255,255,255,0.78)' },
  solid: { backgroundColor: t.colors.card },
  panelInner: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  newChat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  groupHeader: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  row: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowActive: { backgroundColor: t.colors.accentFaint },
  rowPressed: { backgroundColor: t.colors.accentFaint },
  rowText: { gap: 2 },
  stateNote: {
    paddingHorizontal: spacing.sm,
    marginTop: spacing.md,
  },
}));

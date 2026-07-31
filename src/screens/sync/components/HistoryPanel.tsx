import { useEffect, useMemo, useRef } from 'react';
import {
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
import {
  Gesture,
  GestureDetector,
  type GestureType,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Skeleton } from '@/components/ui';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { ConversationSummary } from '@/api/conversations';

interface Props {
  open: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  loading: boolean;
  /** Distinguishes a cold first open from a background refresh. */
  loadedOnce: boolean;
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

// Varied widths, and a second date group: uniform bars would read as a striped
// pattern rather than a list of titles, and the real list is date-grouped.
const SKELETON_GROUPS: number[][] = [
  [86, 64, 78],
  [52, 70],
];

/** The list's shape on a cold first open. */
function HistorySkeleton() {
  const styles = useStyles();
  return (
    <View>
      {SKELETON_GROUPS.map((widths, g) => (
        <View key={g}>
          <Skeleton width={72} height={11} style={styles.groupHeader} />
          {widths.map((w, i) => (
            <View key={i} style={styles.row}>
              <Skeleton width={`${w}%`} height={15} />
              <Skeleton width={44} height={11} style={{ marginTop: spacing.xs }} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
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
  loadedOnce,
  error,
  activeId,
  onSelect,
  onDelete,
  onNewChat,
}: Props) {
  const { colors, scheme } = useTheme();
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

  // Held so each row's swipe-to-delete can block it: both read a leftward drag,
  // and which one wins must not be left to gesture-arena defaults.
  const panRef = useRef<GestureType | undefined>(undefined);

  const pan = Gesture.Pan()
    .withRef(panRef)
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
      <SwipeToDelete
        onDelete={() => onDelete(item.convo)}
        accessibilityLabel={`Delete conversation: ${item.convo.title}`}
        cornerRadius={radius.md}
        // No tuck: these rows are transparent over the glass panel, so a strip
        // slid underneath would show through the title instead of hiding.
        // Clipping to cornerRadius is enough here — there is no opaque card
        // edge to leave notches against.
        fullSwipeDistance={panelWidth * 0.6}
        blocksExternalGesture={panRef}
      >
        <Pressable
          onPress={() => onSelect(item.convo)}
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
      </SwipeToDelete>
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

      {/* First open only. A refresh keeps the stale list — the panel already
          promises never to flash empty, and skeletons would break that. The
          `open` guard matters too: this panel stays mounted while closed, so
          without it the shimmer loop would run forever behind a shut drawer. */}
      {open && loading && !loadedOnce ? (
        <HistorySkeleton />
      ) : !loading && !error && conversations.length === 0 ? (
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
            <BlurView
              tint={scheme === 'dark' ? 'dark' : 'light'}
              intensity={90}
              style={styles.surface}
            >
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
  // Frost keeps blur legible: white veil in light, card-tone veil in dark.
  frostVeil: {
    backgroundColor:
      t.scheme === 'dark' ? 'rgba(22,35,58,0.78)' : 'rgba(255,255,255,0.78)',
  },
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

import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from '@/components/ui';

export interface SessionToast {
  id: string;
  text: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props {
  toasts: SessionToast[];
  onDismiss: (id: string) => void;
  /** How long a toast stays up. */
  durationMs?: number;
  /** At most this many visible at once (oldest dismissed first). */
  maxVisible?: number;
  /** Absolute top of the stack — pass the header's bottom edge so toasts land
   * below it instead of colliding with the title. */
  topOffset?: number;
}

/**
 * Small confirmation pills for live coach actions ("✓ Bench — 5 × 185"),
 * stacked under the header. Auto-dismisses; tap to dismiss sooner.
 */
export function SessionToasts({
  toasts,
  onDismiss,
  durationMs = 2500,
  maxVisible = 2,
  topOffset,
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const visible = toasts.slice(-maxVisible);

  useEffect(() => {
    if (toasts.length === 0) return;
    const oldest = toasts[0];
    const timer = setTimeout(() => onDismiss(oldest.id), durationMs);
    return () => clearTimeout(timer);
  }, [toasts, durationMs, onDismiss]);

  if (visible.length === 0) return null;

  return (
    <View
      style={[styles.stack, topOffset != null && { top: topOffset }]}
      pointerEvents="box-none"
    >
      {visible.map((t) => (
        <Animated.View
          key={t.id}
          entering={SlideInDown.duration(250)}
          exiting={FadeOut.duration(150)}
        >
          <Pressable onPress={() => onDismiss(t.id)} style={styles.toast}>
            <Ionicons
              name={t.icon ?? 'checkmark-circle'}
              size={15}
              color={colors.successText}
            />
            <AppText variant="caption" color="textPrimary" numberOfLines={1}>
              {t.text}
            </AppText>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  stack: {
    position: 'absolute',
    top: spacing.sm,
    left: layout.SCREEN_H_PADDING,
    right: layout.SCREEN_H_PADDING,
    gap: spacing.sm,
    zIndex: 10,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: t.colors.card,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    maxWidth: '100%',
    ...t.shadows.md,
  },
}));

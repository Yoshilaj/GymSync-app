/**
 * iOS-style scroll wheel, pure JS (no native picker dependency).
 *
 * A snapping FlatList with scroll-driven opacity/scale falloff (reanimated,
 * UI-thread), a selection-haptic tick per item, and a highlight band. Numbers
 * render in tabular figures so columns never jitter.
 *
 * Composition: `WheelRow` draws ONE shared band behind several side-by-side
 * wheels (pass `showBand={false}` to the children), with fixed `WheelUnit`
 * labels between them — e.g.  [75] [.6] kg.
 */
import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { makeStyles, radius, spacing } from '@/theme';
import { AppText } from './AppText';

export const WHEEL_ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5;
export const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * VISIBLE_ROWS;
const PAD = WHEEL_ITEM_HEIGHT * 2;

export interface WheelItem<T> {
  value: T;
  label: string;
}

interface WheelPickerProps<T> {
  items: WheelItem<T>[];
  value: T;
  onChange: (v: T) => void;
  width?: number;
  /** Hide the built-in band when a WheelRow draws a shared one. */
  showBand?: boolean;
  /** 'statSm' (tabular) for numbers, 'bodyMedium' for word labels. */
  textVariant?: 'statSm' | 'bodyMedium';
  accessibilityLabel?: string;
}

function hapticTick() {
  void Haptics.selectionAsync();
}

const Row = memo(function Row({
  label,
  index,
  scrollY,
  textVariant,
}: {
  label: string;
  index: number;
  scrollY: SharedValue<number>;
  textVariant: 'statSm' | 'bodyMedium';
}) {
  const styles = useStyles();
  const style = useAnimatedStyle(() => {
    const d = Math.abs(scrollY.value / WHEEL_ITEM_HEIGHT - index);
    return {
      opacity: interpolate(d, [0, 1, 2], [1, 0.45, 0.16], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(d, [0, 2], [1, 0.86], Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.row, style]}>
      <AppText variant={textVariant}>{label}</AppText>
    </Animated.View>
  );
});

export function WheelPicker<T>({
  items,
  value,
  onChange,
  width = 88,
  showBand = true,
  textVariant = 'statSm',
  accessibilityLabel,
}: WheelPickerProps<T>) {
  const styles = useStyles();
  const listRef = useRef<ScrollView>(null);
  const draggingRef = useRef(false);
  const reduceMotion = useReducedMotion();

  const index = Math.max(
    0,
    items.findIndex((it) => it.value === value),
  );
  const scrollY = useSharedValue(index * WHEEL_ITEM_HEIGHT);
  // Paint at the selected row on first frame (no scroll-into-place flash).
  const initialOffset = useRef(index * WHEEL_ITEM_HEIGHT).current;

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Haptic tick each time the centered item changes under the finger.
  useAnimatedReaction(
    () => Math.round(scrollY.value / WHEEL_ITEM_HEIGHT),
    (cur, prev) => {
      if (prev !== null && cur !== prev && cur >= 0 && cur < items.length) {
        runOnJS(hapticTick)();
      }
    },
    [items.length],
  );

  const commit = useCallback(
    (offsetY: number) => {
      draggingRef.current = false;
      const idx = Math.min(
        Math.max(Math.round(offsetY / WHEEL_ITEM_HEIGHT), 0),
        items.length - 1,
      );
      const next = items[idx]?.value;
      if (next !== undefined && next !== value) onChange(next);
    },
    [items, value, onChange],
  );

  // Controlled resync (external value change while not scrolling).
  useEffect(() => {
    if (draggingRef.current) return;
    listRef.current?.scrollTo({
      y: index * WHEEL_ITEM_HEIGHT,
      animated: false,
    });
  }, [index]);

  const centerLabel = items[index]?.label ?? '';

  return (
    <View
      style={[styles.wheel, { width }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: centerLabel }}
      onAccessibilityAction={(e) => {
        const delta = e.nativeEvent.actionName === 'increment' ? 1 : -1;
        const next = items[index + delta];
        if (next) onChange(next.value);
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    >
      {showBand && <View style={styles.band} pointerEvents="none" />}
      {/* Plain ScrollView on purpose: the wheel lives inside ScrollView
          screens, where a nested VirtualizedList breaks windowing (and RN
          warns). Item counts are small enough to render outright. */}
      <Animated.ScrollView
        ref={listRef as never}
        contentOffset={{ x: 0, y: initialOffset }}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: PAD }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          draggingRef.current = true;
        }}
        onMomentumScrollEnd={(e) => commit(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => {
          // No momentum → momentum-end never fires; commit here after snap.
          const y = e.nativeEvent.contentOffset.y;
          if (!e.nativeEvent.velocity?.y) commit(y);
        }}
        nestedScrollEnabled
      >
        {items.map((item, i) => (
          <Row
            key={String(item.value)}
            label={item.label}
            index={i}
            scrollY={scrollY}
            textVariant={textVariant}
          />
        ))}
      </Animated.ScrollView>
      {reduceMotion ? null : null}
    </View>
  );
}

export function NumberWheel({
  min,
  max,
  step = 1,
  value,
  onChange,
  format = String,
  width,
  showBand,
  accessibilityLabel,
}: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
  width?: number;
  showBand?: boolean;
  accessibilityLabel?: string;
}) {
  const items = useMemo<WheelItem<number>[]>(() => {
    const out: WheelItem<number>[] = [];
    for (let n = min; n <= max; n = Math.round((n + step) * 100) / 100) {
      out.push({ value: n, label: format(n) });
    }
    return out;
  }, [min, max, step, format]);
  return (
    <WheelPicker
      items={items}
      value={value}
      onChange={onChange}
      width={width}
      showBand={showBand}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

/** Row container drawing ONE shared highlight band behind multiple wheels. */
export function WheelRow({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.wheelRow}>
      <View style={styles.band} pointerEvents="none" />
      {children}
    </View>
  );
}

/** A fixed (non-scrolling) unit label sitting inside the band line. */
export function WheelUnit({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.unit}>
      <AppText variant="bodyMedium" color="textSecondary">
        {label}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wheel: { height: WHEEL_HEIGHT, overflow: 'hidden' },
  wheelRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    height: WHEEL_HEIGHT,
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PAD,
    height: WHEEL_ITEM_HEIGHT,
    backgroundColor: t.colors.bgSubtle,
    borderRadius: radius.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
  row: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unit: {
    height: WHEEL_HEIGHT,
    justifyContent: 'center',
  },
}));

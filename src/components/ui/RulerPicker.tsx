/**
 * A horizontal ruler picker: drag the scale under a fixed center indicator.
 *
 * The tape-measure idiom for body measurements — a big readout above (owned by
 * the caller), tick marks sliding underneath. Same input mechanics family as
 * WheelPicker (snap + selection haptic per value), rotated 90° and stretched:
 * a wheel shows ~5 values, a ruler shows a whole range's shape at once.
 */
import { useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppText } from './AppText';
import { makeStyles, radius, spacing } from '@/theme';

/** Pixels per step — coarse enough to flick, fine enough to land 1 apart. */
const TICK_W = 10;
const MINOR_H = 14;
const MAJOR_H = 26;
const LABEL_W = 64;

interface Props {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  /** A labelled major tick every N steps. */
  majorEvery: number;
  /** Text under a major tick, e.g. 66 → 5'6". Defaults to the number. */
  formatLabel?: (v: number) => string;
  accessibilityLabel?: string;
}

export function RulerPicker({
  min,
  max,
  step = 1,
  value,
  onChange,
  majorEvery,
  formatLabel = String,
  accessibilityLabel,
}: Props) {
  const styles = useStyles();
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  // What the ruler last reported — external `value` changes only re-sync the
  // scroll position when they DIDN'T come from us (e.g. a unit switch).
  const lastReported = useRef(value);
  const interacting = useRef(false);

  const count = Math.floor((max - min) / step);
  const clampIdx = (i: number) => Math.max(0, Math.min(count, i));
  const idxFor = (v: number) => clampIdx(Math.round((v - min) / step));

  useEffect(() => {
    if (interacting.current || value === lastReported.current) return;
    lastReported.current = value;
    scrollRef.current?.scrollTo({ x: idxFor(value) * TICK_W, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = clampIdx(Math.round(e.nativeEvent.contentOffset.x / TICK_W));
    const v = min + idx * step;
    if (v !== lastReported.current) {
      lastReported.current = v;
      void Haptics.selectionAsync();
      onChange(v);
    }
  };

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: formatLabel(value) }}
    >
      {width > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={TICK_W}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={onScroll}
          onScrollBeginDrag={() => {
            interacting.current = true;
          }}
          onMomentumScrollEnd={() => {
            interacting.current = false;
          }}
          contentOffset={{ x: idxFor(value) * TICK_W, y: 0 }}
          contentContainerStyle={{
            // Half a viewport each side so the first and last tick can reach
            // the fixed center indicator.
            paddingHorizontal: width / 2,
          }}
        >
          <View style={styles.tape}>
            {Array.from({ length: count + 1 }, (_, i) => {
              const major = i % majorEvery === 0;
              return (
                <View key={i} style={styles.tickCell}>
                  <View
                    style={[styles.tick, major ? styles.tickMajor : styles.tickMinor]}
                  />
                  {major && (
                    <View style={styles.labelBox}>
                      <AppText
                        variant="caption"
                        color="textTertiary"
                        align="center"
                        numberOfLines={1}
                      >
                        {formatLabel(min + i * step)}
                      </AppText>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Fixed selection indicator — a dot over a line, like a tape pointer. */}
      <View style={styles.indicator} pointerEvents="none">
        <View style={styles.indicatorDot} />
        <View style={styles.indicatorLine} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    alignSelf: 'stretch',
    height: MAJOR_H + 34,
    justifyContent: 'flex-start',
  },
  tape: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: spacing.sm,
  },
  tickCell: {
    width: TICK_W,
    alignItems: 'center',
  },
  tick: {
    width: 2,
    borderRadius: 1,
  },
  tickMinor: {
    height: MINOR_H,
    backgroundColor: t.colors.border,
    marginTop: MAJOR_H - MINOR_H,
  },
  tickMajor: {
    height: MAJOR_H,
    backgroundColor: t.colors.borderStrong,
  },
  labelBox: {
    position: 'absolute',
    top: MAJOR_H + spacing.sm + spacing.xs,
    width: LABEL_W,
    left: TICK_W / 2 - LABEL_W / 2,
  },
  indicator: {
    ...{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
    alignItems: 'center',
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: t.colors.accent,
    marginBottom: 2,
  },
  indicatorLine: {
    width: 2,
    height: MAJOR_H + spacing.xs,
    borderRadius: 1,
    backgroundColor: t.colors.accent,
  },
}));

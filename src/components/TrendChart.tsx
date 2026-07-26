/**
 * TrendChart — the swipeable, pinch-zoomable timeline chart.
 *
 * Direct manipulation instead of range tabs: the line extends beyond the
 * card at a fixed per-point spacing, so one-finger drags pan through dates
 * (opens anchored at the latest data). Pinching switches the time scale —
 * Days ↔ Weeks ↔ Months — with a haptic tick; the level chip on top also
 * cycles on tap for anyone who doesn't discover the pinch. Long-press raises
 * the pointer tooltip (value + day); a plain drag stays a scroll. Every
 * point draws a dot so a specific day is easy to pin down.
 */
import { useMemo, useState } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  chartColors,
  defaultLineChartProps,
  makeStyles,
  radius,
  spacing,
  useTheme,
} from '@/theme';
import { AppText } from '@/components/ui';
import { chartScale } from '@/lib/chartScale';

export interface TrendPoint {
  /** YYYY-MM-DD */
  day: string;
  value: number;
}

type Level = 'days' | 'weeks' | 'months';
const LEVELS: Level[] = ['days', 'weeks', 'months'];
const LEVEL_LABEL: Record<Level, string> = {
  days: 'Days',
  weeks: 'Weeks',
  months: 'Months',
};
const POINT_SPACING: Record<Level, number> = { days: 44, weeks: 48, months: 56 };

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Sunday-start week bucket key (matches the app's Sunday-first week). */
function weekStartIso(dayIso: string): string {
  const [y, m, d] = dayIso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - date.getDay());
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function bucketKey(dayIso: string, level: Level): string {
  if (level === 'days') return dayIso;
  if (level === 'weeks') return weekStartIso(dayIso);
  return `${dayIso.slice(0, 7)}-01`;
}

function xLabel(dayIso: string, level: Level): string {
  const [y, m, d] = dayIso.split('-').map(Number);
  if (level === 'months') return `${MONTHS_SHORT[m - 1]} '${String(y).slice(2)}`;
  return `${m}/${d}`;
}

function tooltipDate(dayIso: string, level: Level): string {
  const [y, m, d] = dayIso.split('-').map(Number);
  if (level === 'months') return `${MONTHS_SHORT[m - 1]} '${String(y).slice(2)}`;
  const base = `${MONTHS_SHORT[m - 1]} ${d}`;
  return y === new Date().getFullYear() ? base : `${base} '${String(y).slice(2)}`;
}

function ChartTooltip({ value, date }: { value: string; date: string }) {
  const styles = useStyles();
  return (
    <View style={styles.tooltip}>
      <AppText variant="caption" color="textInverse">
        {value}
      </AppText>
      <AppText variant="label" color="rgba(255,255,255,0.7)">
        {date}
      </AppText>
    </View>
  );
}

export function TrendChart({
  points,
  tone,
  width,
  height,
  pad,
  formatValue,
  aggregate,
}: {
  /** Daily points, ascending by day. */
  points: TrendPoint[];
  tone: keyof typeof chartColors;
  width: number;
  height: number;
  /** Y-axis breathing room around the data extremes (display units). */
  pad: number;
  formatValue: (v: number) => string;
  /** avg for level-style metrics (weight), max for best-effort metrics (1RM). */
  aggregate: 'avg' | 'max';
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [level, setLevel] = useState<Level>('days');

  const buckets = useMemo(() => {
    const acc = new Map<string, { sum: number; max: number; n: number }>();
    for (const p of points) {
      const key = bucketKey(p.day, level);
      const b = acc.get(key) ?? { sum: 0, max: -Infinity, n: 0 };
      b.sum += p.value;
      b.max = Math.max(b.max, p.value);
      b.n += 1;
      acc.set(key, b);
    }
    const everyLabel = level === 'days' ? 2 : 1;
    return Array.from(acc.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, b], i) => ({
        day,
        value: +(aggregate === 'max' ? b.max : b.sum / b.n).toFixed(1),
        label: i % everyLabel === 0 ? xLabel(day, level) : '',
      }));
  }, [points, level, aggregate]);

  const scale = chartScale(buckets.map((b) => b.value), pad);

  const shiftLevel = (dir: 1 | -1) => {
    const next = LEVELS.indexOf(level) + dir;
    if (next < 0 || next >= LEVELS.length) return;
    void Haptics.selectionAsync();
    setLevel(LEVELS[next]);
  };
  const cycleLevel = () => {
    void Haptics.selectionAsync();
    setLevel(LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length]);
  };

  // Two-finger pinch rides alongside the chart's one-finger scroll.
  const pinch = Gesture.Pinch().onEnd((e) => {
    'worklet';
    if (e.scale >= 1.25) runOnJS(shiftLevel)(-1); // spread → finer
    else if (e.scale <= 0.8) runOnJS(shiftLevel)(1); // pinch → coarser
  });

  return (
    <View>
      <View style={styles.levelRow}>
        <Pressable onPress={cycleLevel} hitSlop={8} style={styles.levelChip}>
          <AppText variant="label" color="textSecondary">
            {LEVEL_LABEL[level]}
          </AppText>
        </Pressable>
      </View>
      <GestureDetector gesture={pinch}>
        <View style={styles.chartClip}>
          <LineChart
            {...defaultLineChartProps(tone)}
            data={buckets}
            width={width}
            height={height}
            maxValue={scale.maxValue}
            yAxisOffset={scale.yAxisOffset}
            noOfSections={scale.noOfSections}
            spacing={POINT_SPACING[level]}
            // Half a slot of breathing room so the first point and its label
            // clear the y-axis instead of hiding beneath it.
            initialSpacing={POINT_SPACING[level] / 2}
            endSpacing={POINT_SPACING[level] / 2}
            scrollToEnd
            scrollAnimation={false}
            hideDataPoints={false}
            dataPointsColor={chartColors[tone]}
            dataPointsRadius={3.5}
            pointerConfig={{
              activatePointersOnLongPress: true,
              pointerStripColor: colors.border,
              pointerStripWidth: 1,
              pointerColor: chartColors[tone],
              radius: 5,
              pointerLabelWidth: 88,
              pointerLabelHeight: 44,
              autoAdjustPointerLabelPosition: true,
              pointerVanishDelay: 120,
              pointerLabelComponent: (items: { value: number; day?: string }[]) => {
                const it = items[0];
                if (!it) return null;
                return (
                  <ChartTooltip
                    value={formatValue(it.value)}
                    date={it.day ? tooltipDate(it.day, level) : ''}
                  />
                );
              },
            }}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.xs,
  },
  levelChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: t.colors.bgSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
  },
  chartClip: {
    overflow: 'hidden',
  },
  tooltip: {
    backgroundColor: t.colors.textPrimary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    gap: 1,
  },
}));

/**
 * The Plan page's week strip — now pageable: swipe horizontally to move
 * between weeks (±52 from today), with native paging momentum, a selection
 * haptic on week commit, and a small week label ("This week" / "Aug 3 – 9").
 * Selection is date-based (iso); the plan itself is weekly-recurring, so the
 * marked dots repeat every week by design. The accent "today" treatment only
 * appears in the real current week.
 */
import { useCallback } from 'react';
import { FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from '@/components/ui';

const WEEK: { letter: string; long: string }[] = [
  { letter: 'S', long: 'Sun' },
  { letter: 'M', long: 'Mon' },
  { letter: 'T', long: 'Tue' },
  { letter: 'W', long: 'Wed' },
  { letter: 'T', long: 'Thu' },
  { letter: 'F', long: 'Fri' },
  { letter: 'S', long: 'Sat' },
];

const WEEK_RANGE = 52; // ±1 year of swipeable weeks
const PAGE_COUNT = WEEK_RANGE * 2 + 1;
const OFFSETS = Array.from({ length: PAGE_COUNT }, (_, i) => i - WEEK_RANGE);

export interface WeekDay {
  letter: string;
  /** Three-letter day label ('Mon') — the key used across the plan data. */
  long: string;
  date: number;
  iso: string;
}

/** The week (Sunday-first) around a reference date. */
export function getWeekDates(reference = new Date()): WeekDay[] {
  const day = reference.getDay();
  const sunday = new Date(reference);
  sunday.setDate(reference.getDate() - day);
  return WEEK.map((w, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return { ...w, date: d.getDate(), iso: d.toDateString() };
  });
}

function weekLabel(offset: number, todayIso: string): string {
  if (offset === 0) return 'This week';
  if (offset === 1) return 'Next week';
  if (offset === -1) return 'Last week';
  const ref = new Date(todayIso);
  ref.setDate(ref.getDate() + offset * 7);
  const wk = getWeekDates(ref);
  const first = new Date(wk[0].iso);
  const last = new Date(wk[6].iso);
  const fmt = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString(undefined, withMonth ? { month: 'short', day: 'numeric' } : { day: 'numeric' });
  return `${fmt(first, true)} – ${fmt(last, first.getMonth() !== last.getMonth())}`;
}

interface Props {
  selectedIso: string;
  todayIso: string;
  onSelectIso: (iso: string) => void;
  /** Day labels ('Mon') that have a workout — shown as a dot under the date. */
  markedDays?: string[];
  weekOffset: number;
  onWeekChange: (offset: number) => void;
}

function DayCell({
  d,
  active,
  isToday,
  marked,
  onPress,
}: {
  d: WeekDay;
  active: boolean;
  isToday: boolean;
  marked: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={styles.cell}>
      <AppText
        variant="label"
        color={
          active
            ? colors.textPrimary
            : isToday
              ? colors.accentText
              : colors.textSecondary
        }
      >
        {d.letter}
      </AppText>
      <View style={[styles.capsule, active && styles.capsuleActive]}>
        <AppText
          variant="h3"
          color={
            active
              ? colors.textInverse
              : isToday
                ? colors.accentText
                : colors.textPrimary
          }
        >
          {d.date}
        </AppText>
      </View>
      <View
        style={[
          styles.dot,
          marked && !active && styles.dotMarked,
          isToday && !active && styles.dotToday,
        ]}
      />
    </Pressable>
  );
}

export function DayStrip({
  selectedIso,
  todayIso,
  onSelectIso,
  markedDays = [],
  weekOffset,
  onWeekChange,
}: Props) {
  const styles = useStyles();
  const { width } = useWindowDimensions();

  const weekFor = useCallback(
    (offset: number) => {
      const ref = new Date(todayIso);
      ref.setDate(ref.getDate() + offset * 7);
      return getWeekDates(ref);
    },
    [todayIso],
  );

  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        data={OFFSETS}
        keyExtractor={(o) => String(o)}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={WEEK_RANGE}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          const next = idx - WEEK_RANGE;
          if (next !== weekOffset) {
            void Haptics.selectionAsync();
            onWeekChange(next);
          }
        }}
        renderItem={({ item: offset }) => (
          <View style={[styles.page, { width }]}>
            {weekFor(offset).map((d) => (
              <DayCell
                key={d.iso}
                d={d}
                active={d.iso === selectedIso}
                isToday={d.iso === todayIso}
                marked={markedDays.includes(d.long)}
                onPress={() => onSelectIso(d.iso)}
              />
            ))}
          </View>
        )}
      />
      <Animated.View key={weekOffset} entering={FadeIn.duration(180)}>
        <AppText
          variant="caption"
          color="textTertiary"
          align="center"
          style={styles.weekLabel}
        >
          {weekLabel(weekOffset, todayIso)}
        </AppText>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    marginTop: spacing.lg,
  },
  page: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: layout.SCREEN_H_PADDING,
  },
  weekLabel: { marginTop: spacing.sm },
  cell: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  capsule: {
    width: 36,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsuleActive: {
    backgroundColor: t.colors.accent,
    ...t.shadows.glow,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  dotMarked: { backgroundColor: t.colors.borderStrong },
  dotToday: { backgroundColor: t.colors.accent },
}));

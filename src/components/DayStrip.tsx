import { Pressable, StyleSheet, View } from 'react-native';
import { colors, layout, radius, shadows, spacing } from '@/theme';
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

export interface WeekDay {
  letter: string;
  /** Three-letter day label ('Mon') — the key used across the plan data. */
  long: string;
  date: number;
  iso: string;
}

/** The current week (Sunday-first) around a reference date. */
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

interface Props {
  week: WeekDay[];
  selected: string;
  today: string;
  onSelect: (day: string) => void;
  /** Day labels ('Mon') that have a workout — shown as a dot under the date. */
  markedDays?: string[];
}

export function DayStrip({ week, selected, today, onSelect, markedDays = [] }: Props) {
  return (
    <View style={styles.row}>
      {week.map((d) => {
        const active = d.long === selected;
        const isToday = d.long === today;
        const marked = markedDays.includes(d.long);
        return (
          <Pressable
            key={d.long}
            onPress={() => onSelect(d.long)}
            style={styles.cell}
          >
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
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: layout.SCREEN_H_PADDING,
    marginTop: spacing.lg,
  },
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
    backgroundColor: colors.accent,
    ...shadows.glow,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  dotMarked: { backgroundColor: colors.borderStrong },
  dotToday: { backgroundColor: colors.accent },
});

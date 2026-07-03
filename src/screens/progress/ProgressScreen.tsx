import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, defaultLineChartProps, layout, radius, spacing } from '@/theme';
import { AppText, Card, Entering, StatTile } from '@/components/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ChartCard } from '@/components/ChartCard';
import { mockProgress } from '@/data/mockProgress';
import { mockPlan } from '@/data/mockPlan';
import { getExerciseById, mockExercises } from '@/data/mockExercises';
import { useTabBarClearance } from '@/hooks';
import { ProgressStackParamList } from '@/navigation/ProgressStack';

type Nav = NativeStackNavigationProp<ProgressStackParamList, 'ProgressHome'>;
type Rt = RouteProp<ProgressStackParamList, 'ProgressHome'>;

const { width: SCREEN_W } = Dimensions.get('window');
const CAL_ITEM_W = SCREEN_W - spacing.lg * 4;
const CHART_W = SCREEN_W - spacing.lg * 4 - 28;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_RANGE = 24;
const CENTER_INDEX = 12;

type Metric = 'strength' | 'volume';

function monthAtOffset(offset: number) {
  const ref = new Date();
  return new Date(ref.getFullYear(), ref.getMonth() + offset - CENTER_INDEX, 1);
}

export function ProgressScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();

  const [exerciseId, setExerciseId] = useState<string>('ex-bench');
  const [metric, setMetric] = useState<Metric>('strength');
  const clearance = useTabBarClearance();

  useEffect(() => {
    const params = route.params;
    if (params?.pickedExercise) {
      setExerciseId(params.pickedExercise);
      nav.setParams({ pickedExercise: undefined, returnKey: undefined } as never);
    }
  }, [route.params?.pickedExercise]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader variant="brand" title="Progress" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: clearance.scroll }]}
        showsVerticalScrollIndicator={false}
      >
        <Entering>
          <View style={styles.metricsRow}>
            <StatTile
              label="Streak"
              value={mockProgress.currentStreak}
              unit="days"
              icon="flame"
              tone="live"
            />
            <StatTile
              label="PRs · month"
              value={mockProgress.prsThisMonth}
              icon="trophy"
              tone="warning"
            />
            <StatTile
              label="This week"
              value={mockProgress.daysTrainedThisWeek}
              unit="/ 4"
              icon="barbell"
              tone="accent"
            />
          </View>
        </Entering>

        <Entering index={1}>
          <CalendarBlock />
        </Entering>

        <Entering index={2}>
          <ExerciseTrends
            exerciseId={exerciseId}
            metric={metric}
            onMetricChange={setMetric}
            onPickExercise={() =>
              nav.navigate('ExerciseList', { mode: 'picker', returnKey: 'strength' })
            }
          />
        </Entering>

        <Entering index={3}>
          <BodyWeightBlock />
        </Entering>
      </ScrollView>
    </SafeAreaView>
  );
}

function CalendarBlock() {
  const nav = useNavigation<Nav>();
  const listRef = useRef<FlatList<number>>(null);
  const [activeOffset, setActiveOffset] = useState(CENTER_INDEX);

  const data = useMemo(() => Array.from({ length: MONTH_RANGE }, (_, i) => i), []);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActiveOffset(Math.round(e.nativeEvent.contentOffset.x / CAL_ITEM_W));
  };

  const current = monthAtOffset(activeOffset);
  const monthLabel = `${MONTHS[current.getMonth()]} ${current.getFullYear()}`;

  const goto = (dir: -1 | 1) => {
    const next = Math.max(0, Math.min(MONTH_RANGE - 1, activeOffset + dir));
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setActiveOffset(next);
  };

  return (
    <Card radius="xl" style={styles.calendarCard}>
      <View style={styles.calendarHeader}>
        <Pressable onPress={() => goto(-1)} hitSlop={10} style={styles.calArrow}>
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="h3">{monthLabel}</AppText>
        <Pressable onPress={() => goto(1)} hitSlop={10} style={styles.calArrow}>
          <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LETTERS.map((d, i) => (
          <AppText
            key={i}
            variant="label"
            color={i === 0 || i === 6 ? 'textTertiary' : 'textSecondary'}
            style={styles.weekdayText}
          >
            {d}
          </AppText>
        ))}
      </View>

      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(i) => `m-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={CENTER_INDEX}
        getItemLayout={(_, i) => ({ length: CAL_ITEM_W, offset: CAL_ITEM_W * i, index: i })}
        snapToInterval={CAL_ITEM_W}
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item }) => (
          <MonthView
            offset={item}
            onPressDate={(iso) => nav.navigate('DayDetail', { iso })}
          />
        )}
      />
    </Card>
  );
}

function MonthView({
  offset,
  onPressDate,
}: {
  offset: number;
  onPressDate: (iso: string) => void;
}) {
  const d = monthAtOffset(offset);
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const isCurrent = year === today.getFullYear() && month === today.getMonth();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <View style={[styles.monthView, { width: CAL_ITEM_W }]}>
      {Array.from({ length: cells.length / 7 }).map((_, w) => (
        <View key={w} style={styles.weekRow}>
          {cells.slice(w * 7, w * 7 + 7).map((day, i) => {
            if (day === null) return <View key={i} style={styles.dayCell} />;
            const dayDate = new Date(year, month, day);
            const dayLabel = WEEKDAY_LONG[dayDate.getDay()];
            const hasWorkout = mockPlan.workouts.some((w) => w.dayLabel === dayLabel);
            const isToday = isCurrent && day === today.getDate();

            return (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.dayCell, pressed && { opacity: 0.6 }]}
                onPress={() => onPressDate(dayDate.toDateString())}
              >
                <View style={[styles.dayBubble, isToday && styles.dayBubbleToday]}>
                  <AppText
                    variant="caption"
                    color={isToday ? 'textInverse' : 'textPrimary'}
                    style={styles.dayNum}
                  >
                    {day}
                  </AppText>
                </View>
                <View style={styles.markRow}>
                  {hasWorkout && <View style={styles.mark} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Strength and Volume merged into one block with a metric toggle. */
function ExerciseTrends({
  exerciseId,
  metric,
  onMetricChange,
  onPickExercise,
}: {
  exerciseId: string;
  metric: Metric;
  onMetricChange: (m: Metric) => void;
  onPickExercise: () => void;
}) {
  const ex = getExerciseById(exerciseId) ?? mockExercises[0];

  // Deterministic synthetic series until a real history endpoint exists —
  // flagged in the UI with the "Sample data" chip.
  const data = useMemo(() => {
    const hash = [...exerciseId].reduce((a, c) => a + c.charCodeAt(0), 0);
    const base = metric === 'volume' ? 12 + (hash % 8) : 140 + (hash % 60);
    return mockProgress.estimated1RM.map((p, i) => ({
      value: Math.round(
        base +
          i * (metric === 'volume' ? 0.4 : 1.1) +
          Math.sin(i + hash) * (metric === 'volume' ? 1.2 : 4),
      ),
      label: i % 3 === 0 ? p.date.slice(3) : '',
    }));
  }, [exerciseId, metric]);

  const diff = data[data.length - 1].value - data[0].value;
  const up = diff >= 0;
  const unit = metric === 'volume' ? 'k lbs' : 'lbs';

  return (
    <ChartCard
      title="Exercise trends"
      subtitle={metric === 'strength' ? 'Estimated 1RM' : 'Weekly weight moved'}
      chip="Sample data"
    >
      <View style={styles.trendControls}>
        <View style={styles.segmented}>
          {(['strength', 'volume'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => onMetricChange(m)}
              style={[styles.segment, metric === m && styles.segmentActive]}
            >
              <AppText
                variant="caption"
                color={metric === m ? 'textPrimary' : 'textSecondary'}
              >
                {m === 'strength' ? 'Strength' : 'Volume'}
              </AppText>
            </Pressable>
          ))}
        </View>
        <View
          style={[
            styles.trendBadge,
            { backgroundColor: up ? colors.successSoft : colors.dangerSoft },
          ]}
        >
          <Ionicons
            name={up ? 'trending-up' : 'trending-down'}
            size={12}
            color={up ? colors.successText : colors.dangerText}
          />
          <AppText variant="caption" color={up ? 'successText' : 'dangerText'}>
            {up ? '+' : ''}
            {diff} {unit}
          </AppText>
        </View>
      </View>

      <Pressable onPress={onPickExercise} style={styles.pickerButton}>
        <View style={styles.pickerLeft}>
          <Ionicons name="barbell-outline" size={16} color={colors.accentText} />
          <AppText variant="bodyMedium">{ex.name}</AppText>
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
      </Pressable>

      <View style={styles.chartWrap}>
        <LineChart
          {...defaultLineChartProps(metric === 'strength' ? 'primary' : 'secondary')}
          data={data}
          width={CHART_W}
          height={160}
          maxValue={Math.max(...data.map((d) => d.value)) + 6}
          yAxisOffset={Math.max(0, Math.min(...data.map((d) => d.value)) - 6)}
        />
      </View>
    </ChartCard>
  );
}

function BodyWeightBlock() {
  const data = useMemo(
    () =>
      mockProgress.bodyweight.map((p, i) => ({
        value: p.value,
        label: i % 3 === 0 ? p.date.slice(3) : '',
      })),
    [],
  );

  const latest = data[data.length - 1].value;
  const diff = +(latest - data[0].value).toFixed(1);
  const up = diff >= 0;

  return (
    <ChartCard
      title="Body weight"
      subtitle={`${latest.toFixed(1)} lbs today`}
      chip="Sample data"
    >
      <View style={styles.trendControls}>
        <View />
        <View style={[styles.trendBadge, { backgroundColor: colors.warningSoft }]}>
          <Ionicons
            name={up ? 'trending-up' : 'trending-down'}
            size={12}
            color={colors.warningText}
          />
          <AppText variant="caption" color="warningText">
            {up ? '+' : ''}
            {diff} lbs
          </AppText>
        </View>
      </View>
      <View style={styles.chartWrap}>
        <LineChart
          {...defaultLineChartProps('hot')}
          data={data}
          width={CHART_W}
          height={140}
          noOfSections={3}
        />
      </View>
    </ChartCard>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
    gap: spacing.lg,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  calendarCard: { gap: spacing.md },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calArrow: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSubtle,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  weekdayText: {
    width: CAL_ITEM_W / 7,
    textAlign: 'center',
  },
  monthView: { gap: spacing.xs },
  weekRow: { flexDirection: 'row' },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayBubble: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBubbleToday: { backgroundColor: colors.accent },
  dayNum: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  markRow: {
    marginTop: 3,
    height: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  trendControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.sunken,
    borderRadius: radius.pill,
    padding: 3,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
  },
  segmentActive: {
    backgroundColor: colors.card,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  pickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  chartWrap: {
    marginLeft: -6,
  },
});

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ScrollView,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '@/theme';
import { AppHeader } from '@/components/AppHeader';
import { mockProgress } from '@/data/mockProgress';
import { mockPlan } from '@/data/mockPlan';
import { getExerciseById, mockExercises } from '@/data/mockExercises';
import { ProgressStackParamList } from '@/navigation/ProgressStack';

type Nav = NativeStackNavigationProp<ProgressStackParamList, 'ProgressHome'>;
type Rt = RouteProp<ProgressStackParamList, 'ProgressHome'>;

const { width: SCREEN_W } = Dimensions.get('window');
const CAL_ITEM_W = SCREEN_W - spacing.lg * 4;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_RANGE = 24;
const CENTER_INDEX = 12;

function monthAtOffset(offset: number) {
  const ref = new Date();
  const d = new Date(ref.getFullYear(), ref.getMonth() + offset - CENTER_INDEX, 1);
  return d;
}

export function ProgressScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();

  const [strengthExId, setStrengthExId] = useState<string>('ex-bench');
  const [volumeExId, setVolumeExId] = useState<string>('ex-squat');

  useEffect(() => {
    const params = route.params;
    if (params?.pickedExercise && params?.returnKey) {
      if (params.returnKey === 'strength') setStrengthExId(params.pickedExercise);
      if (params.returnKey === 'volume') setVolumeExId(params.pickedExercise);
      nav.setParams({ pickedExercise: undefined, returnKey: undefined } as never);
    }
  }, [route.params?.pickedExercise, route.params?.returnKey]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AppHeader variant="brand" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <KeyMetrics />
        <CalendarBlock />
        <GraphBlock
          title="Strength"
          subtitle="Estimated 1RM"
          exerciseId={strengthExId}
          accent={colors.accent}
          onPickExercise={() =>
            nav.navigate('ExerciseList', { mode: 'picker', returnKey: 'strength' })
          }
          seed={0.9}
          unit="lbs"
        />
        <GraphBlock
          title="Volume"
          subtitle="Weekly weight moved"
          exerciseId={volumeExId}
          accent={colors.success}
          onPickExercise={() =>
            nav.navigate('ExerciseList', { mode: 'picker', returnKey: 'volume' })
          }
          seed={40}
          unit="k lbs"
        />
        <BodyWeightBlock />
      </ScrollView>
    </SafeAreaView>
  );
}

function KeyMetrics() {
  return (
    <View style={styles.metricsRow}>
      <MetricCard
        label="Streak"
        value={`${mockProgress.currentStreak}`}
        unit="days"
        icon="flame"
        accent="#FF7A30"
      />
      <MetricCard
        label="PRs · month"
        value={`${mockProgress.prsThisMonth}`}
        icon="trophy"
        accent={colors.warning}
      />
      <MetricCard
        label="This week"
        value={`${mockProgress.daysTrainedThisWeek}`}
        unit="/ 4"
        icon="barbell"
        accent={colors.accent}
      />
    </View>
  );
}

function MetricCard({
  label,
  value,
  unit,
  icon,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: any;
  accent: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIconBubble, { backgroundColor: accent + '22' }]}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <View style={styles.metricNumRow}>
        <Text style={styles.metricValue}>{value}</Text>
        {unit && <Text style={styles.metricUnit}>{unit}</Text>}
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function CalendarBlock() {
  const nav = useNavigation<Nav>();
  const listRef = useRef<FlatList<number>>(null);
  const [activeOffset, setActiveOffset] = useState(CENTER_INDEX);

  const data = useMemo(
    () => Array.from({ length: MONTH_RANGE }, (_, i) => i),
    []
  );

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / CAL_ITEM_W);
    setActiveOffset(i);
  };

  const current = monthAtOffset(activeOffset);
  const monthLabel = `${MONTHS[current.getMonth()]} ${current.getFullYear()}`;

  const goto = (dir: -1 | 1) => {
    const next = Math.max(0, Math.min(MONTH_RANGE - 1, activeOffset + dir));
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setActiveOffset(next);
  };

  return (
    <View style={styles.calendarCard}>
      <View style={styles.calendarHeader}>
        <Pressable onPress={() => goto(-1)} hitSlop={10} style={styles.calArrow}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.calendarTitle}>{monthLabel}</Text>
        <Pressable onPress={() => goto(1)} hitSlop={10} style={styles.calArrow}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LETTERS.map((d, i) => (
          <Text
            key={i}
            style={[styles.weekdayText, (i === 0 || i === 6) && styles.weekdayWeekend]}
          >
            {d}
          </Text>
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
    </View>
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
            if (day === null) {
              return <View key={i} style={styles.dayCell} />;
            }
            const dayDate = new Date(year, month, day);
            const dayLabel = WEEKDAY_LONG[dayDate.getDay()];
            const hasWorkout = mockPlan.workouts.some((w) => w.dayLabel === dayLabel);
            const isToday =
              isCurrent && day === today.getDate();

            return (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.dayCell, pressed && { opacity: 0.6 }]}
                onPress={() => onPressDate(dayDate.toDateString())}
              >
                <View
                  style={[
                    styles.dayBubble,
                    isToday && styles.dayBubbleToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNum,
                      isToday && styles.dayNumToday,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
                <View style={styles.markRow}>
                  {hasWorkout ? (
                    <View style={[styles.mark, { backgroundColor: colors.accent }]} />
                  ) : (
                    <View style={styles.markEmpty} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function GraphBlock({
  title,
  subtitle,
  exerciseId,
  accent,
  onPickExercise,
  seed,
  unit,
}: {
  title: string;
  subtitle: string;
  exerciseId: string;
  accent: string;
  onPickExercise: () => void;
  seed: number;
  unit: string;
}) {
  const ex = getExerciseById(exerciseId) ?? mockExercises[0];
  const data = useMemo(() => {
    // Deterministic variation per exercise id
    const hash = [...exerciseId].reduce((a, c) => a + c.charCodeAt(0), 0);
    const base = title === 'Volume' ? 12 + (hash % 8) : 140 + (hash % 60);
    return mockProgress.estimated1RM.map((p, i) => ({
      value: Math.round(
        base +
          i * (title === 'Volume' ? 0.4 : 1.1) +
          Math.sin(i + hash) * (title === 'Volume' ? 1.2 : 4)
      ),
      label: i % 3 === 0 ? p.date.slice(3) : '',
      dataPointText: undefined,
    }));
  }, [exerciseId, title]);

  const latest = data[data.length - 1].value;
  const first = data[0].value;
  const diff = latest - first;
  const up = diff >= 0;

  const chartWidth = SCREEN_W - spacing.lg * 2 - spacing.lg * 2 - 28;

  return (
    <View style={styles.graphCard}>
      <View style={styles.graphHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.graphTitle}>{title}</Text>
          <Text style={styles.graphSubtitle}>{subtitle}</Text>
        </View>
        <View style={[styles.graphTrendBadge, { backgroundColor: (up ? colors.success : colors.danger) + '22' }]}>
          <Ionicons
            name={up ? 'trending-up' : 'trending-down'}
            size={12}
            color={up ? colors.success : colors.danger}
          />
          <Text style={[styles.graphTrendText, { color: up ? colors.success : colors.danger }]}>
            {up ? '+' : ''}{diff} {unit}
          </Text>
        </View>
      </View>

      <Pressable onPress={onPickExercise} style={styles.pickerButton}>
        <View style={styles.pickerLeft}>
          <Ionicons name="barbell-outline" size={16} color={colors.accent} />
          <Text style={styles.pickerText}>{ex.name}</Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>

      <View style={styles.chartWrap}>
        <LineChart
          data={data}
          width={chartWidth}
          height={160}
          thickness={3}
          color={accent}
          dataPointsColor={accent}
          hideDataPoints={false}
          dataPointsRadius={3}
          yAxisColor="transparent"
          xAxisColor={colors.borderSoft}
          rulesColor={colors.borderSoft}
          rulesType="dashed"
          yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
          curved
          initialSpacing={10}
          noOfSections={4}
          areaChart
          startFillColor={accent}
          endFillColor={accent}
          startOpacity={0.22}
          endOpacity={0.02}
          maxValue={Math.max(...data.map((d) => d.value)) + 6}
          yAxisOffset={Math.max(0, Math.min(...data.map((d) => d.value)) - 6)}
        />
      </View>
    </View>
  );
}

function BodyWeightBlock() {
  const data = useMemo(
    () =>
      mockProgress.bodyweight.map((p, i) => ({
        value: p.value,
        label: i % 3 === 0 ? p.date.slice(3) : '',
      })),
    []
  );

  const latest = data[data.length - 1].value;
  const first = data[0].value;
  const diff = +(latest - first).toFixed(1);
  const up = diff >= 0;
  const chartWidth = SCREEN_W - spacing.lg * 2 - spacing.lg * 2 - 28;

  return (
    <View style={styles.graphCard}>
      <View style={styles.graphHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.graphTitle}>Body weight</Text>
          <Text style={styles.graphSubtitle}>{latest.toFixed(1)} lbs today</Text>
        </View>
        <View style={[styles.graphTrendBadge, { backgroundColor: colors.warning + '22' }]}>
          <Ionicons
            name={up ? 'trending-up' : 'trending-down'}
            size={12}
            color={colors.warning}
          />
          <Text style={[styles.graphTrendText, { color: colors.warning }]}>
            {up ? '+' : ''}{diff} lbs
          </Text>
        </View>
      </View>

      <View style={styles.chartWrap}>
        <LineChart
          data={data}
          width={chartWidth}
          height={140}
          thickness={3}
          color={colors.warning}
          dataPointsColor={colors.warning}
          yAxisColor="transparent"
          xAxisColor={colors.borderSoft}
          rulesColor={colors.borderSoft}
          rulesType="dashed"
          yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
          curved
          initialSpacing={10}
          noOfSections={3}
          areaChart
          startFillColor={colors.warning}
          endFillColor={colors.warning}
          startOpacity={0.22}
          endOpacity={0.02}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: spacing.xs,
  },
  metricIconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricNumRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginTop: spacing.xs,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.8,
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.2,
    marginTop: 2,
  },
  calendarCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: spacing.md,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  calendarTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.3,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1,
    width: CAL_ITEM_W / 7,
    textAlign: 'center',
  },
  weekdayWeekend: {
    color: colors.textDim,
  },
  monthView: {
    gap: spacing.xs,
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dayBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBubbleToday: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  dayNum: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  dayNumToday: {
    color: '#fff',
    fontWeight: '900',
  },
  markRow: {
    marginTop: 3,
    height: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  markEmpty: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  graphCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: spacing.md,
  },
  graphHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  graphTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.4,
  },
  graphSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 2,
  },
  graphTrendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  graphTrendText: {
    fontSize: 11,
    fontWeight: '800',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  pickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  pickerText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  chartWrap: {
    marginLeft: -6,
    marginTop: 4,
  },
});

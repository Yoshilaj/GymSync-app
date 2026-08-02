import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Ellipse } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useIsFocused,
  useNavigation,
  useRoute,
  RouteProp,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';
import { TrendChart } from '@/components/TrendChart';
import { AppText, Card, EmptyState, Entering, Skeleton } from '@/components/ui';
import { ChartCard } from '@/components/ChartCard';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { usePlan } from '@/context/PlanContext';
import { getExerciseByName, resolvePlannedExercise } from '@/data/mockExercises';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/auth/AuthContext';
import { useProgress, useTabBarClearance } from '@/hooks';
import { kgToLbs } from '@/lib/units';
import type { BodyWeightPoint, ProgressSummary, SeriesPoint } from '@/api/progress';
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
  const styles = useStyles();
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();

  const [exerciseId, setExerciseId] = useState<string>('ex-bench');
  const [metric, setMetric] = useState<Metric>('strength');
  const clearance = useTabBarClearance();
  const {
    summary,
    bodyWeight,
    series,
    summaryLoading,
    bodyWeightLoading,
    seriesLoading,
    refresh,
  } = useProgress(exerciseId, metric);

  // This screen refetches on focus, which covers most of it — but a fetch that
  // failed while you were already here had no retry short of leaving the tab.
  const [refreshing, setRefreshing] = useState(false);
  const onPullToRefresh = useCallback(() => {
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  }, [refresh]);

  // Until the user picks an exercise themselves, follow what they actually
  // trained last — a fresh squat session should open on squats, not an empty
  // default bench chart.
  const userPickedRef = useRef(false);
  useEffect(() => {
    if (userPickedRef.current) return;
    const recent = summary?.recent_exercises?.[0];
    const match = recent ? getExerciseByName(recent) : undefined;
    if (match) setExerciseId(match.id);
  }, [summary?.recent_exercises]);

  useEffect(() => {
    const params = route.params;
    if (params?.pickedExercise) {
      userPickedRef.current = true;
      setExerciseId(params.pickedExercise);
      nav.setParams({ pickedExercise: undefined, returnKey: undefined } as never);
    }
  }, [route.params?.pickedExercise]);

  const focused = useIsFocused();

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {/* The header gradient owns the status-bar area — flip to light while
          this screen is front-most, revert everywhere else. */}
      {focused && <StatusBar style="light" />}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: clearance.scroll }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullToRefresh}
            // White: the header gradient owns the top of this screen, and the
            // default dark spinner disappears against it.
            tintColor="#fff"
          />
        }
      >
        <ProfileHeader
          onOpenSettings={() => nav.navigate('Settings')}
          summary={summary}
          loading={summaryLoading}
        />

        <Entering index={1}>
          <CalendarBlock />
        </Entering>

        <Entering index={2}>
          <ExerciseTrends
            exerciseId={exerciseId}
            metric={metric}
            series={series}
            loading={seriesLoading}
            onMetricChange={setMetric}
            onPickExercise={() =>
              nav.navigate('ExerciseList', { mode: 'picker', returnKey: 'strength' })
            }
          />
        </Entering>

        <Entering index={3}>
          <BodyWeightBlock points={bodyWeight} loading={bodyWeightLoading} />
        </Entering>
      </ScrollView>
    </SafeAreaView>
  );
}

const RING_SIZE = 84;
const RING_STROKE = 5;
const AVATAR_SIZE = 68;

/**
 * Card-free profile header: a full-bleed twilight sky that flows under the
 * status bar and melts into the page through a concave curve. Identity is a
 * centered composition — avatar wrapped in a live weekly-training ring,
 * display-type name, and bare typographic stats. No boxes, no bands.
 */
function ProfileHeader({
  onOpenSettings,
  summary,
  loading,
}: {
  onOpenSettings: () => void;
  summary: ProgressSummary | null;
  loading: boolean;
}) {
  const { colors, gradients } = useTheme();
  const styles = useStyles();
  const { user, profile } = useUser();
  const { user: authUser } = useAuth();
  const insets = useSafeAreaInsets();

  // Real numbers only — a fresh account shows zeros, never sample data.
  const streak = summary?.current_streak ?? 0;
  const prs = summary?.prs_this_month ?? 0;
  const daysThisWeek = summary?.days_this_week ?? 0;
  const weekTarget = summary?.week_target ?? 4;

  // The ring is data: how much of this week's plan is already trained.
  const weekProgress = Math.min(1, weekTarget > 0 ? daysThisWeek / weekTarget : 0);
  const ringR = (RING_SIZE - RING_STROKE) / 2;
  const ringC = 2 * Math.PI * ringR;

  const joined = authUser?.created_at
    ? new Date(authUser.created_at).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
    : null;

  const stats: [string, string][] = [
    [`${streak}`, 'day streak'],
    [`${prs}`, 'PRs · month'],
    [`${daysThisWeek}/${weekTarget}`, 'this week'],
  ];

  return (
    <View style={styles.header}>
      <LinearGradient
        // Deepest navy at the top, lifting toward blue as it meets the page —
        // the rest gradient read upside down.
        colors={[gradients.rest[2], gradients.rest[1], gradients.rest[0]]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.headerGradient, { paddingTop: insets.top + spacing.sm }]}
      >
        {/* Night sky drifting across the full width */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Circle cx="88%" cy={40} r={52} fill="none" strokeWidth={1.5} stroke="rgba(255,255,255,0.10)" />
            <Circle cx="88%" cy={40} r={86} fill="none" strokeWidth={1.5} stroke="rgba(255,255,255,0.06)" />
            <Circle cx="6%" cy={120} r={40} fill="none" strokeWidth={1.5} stroke="rgba(255,255,255,0.08)" />
            <Circle cx="8%" cy={44} r={2} fill="rgba(255,255,255,0.45)" />
            <Circle cx="22%" cy={90} r={1.5} fill="rgba(255,255,255,0.4)" />
            <Circle cx="72%" cy={130} r={2.5} fill="rgba(255,255,255,0.4)" />
            <Circle cx="93%" cy={150} r={1.5} fill="rgba(255,255,255,0.45)" />
            <Circle cx="38%" cy={30} r={1.5} fill="rgba(255,255,255,0.35)" />
          </Svg>
        </View>

        <Pressable
          onPress={onOpenSettings}
          hitSlop={12}
          style={styles.menuBtn}
        >
          <Ionicons name="menu" size={26} color={colors.textInverse} />
        </Pressable>

        {/* Avatar inside its weekly-training ring */}
        <View style={styles.ringWrap}>
          <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={ringR}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={RING_STROKE}
              fill="none"
            />
            {/* Omit the progress arc entirely until the summary lands. At zero
                it's not invisible: the round linecap still paints a dot at 12
                o'clock, which is exactly the pop-in this is meant to remove. */}
            {loading ? null : (
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={ringR}
                stroke={gradients.brand[0]}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={ringC}
                strokeDashoffset={ringC * (1 - weekProgress)}
                transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              />
            )}
          </Svg>
          <ProfileAvatar name={user.displayName} size={AVATAR_SIZE} uri={profile?.avatar_url} />
        </View>

        <AppText variant="display" color="textInverse" align="center">
          {user.displayName}
        </AppText>
        {joined ? (
          <AppText
            variant="caption"
            color="rgba(255,255,255,0.8)"
            align="center"
            style={styles.handle}
          >
            Joined {joined}
          </AppText>
        ) : null}

        {/* Bare typographic stats — whitespace instead of boxes */}
        <View style={styles.statsRow}>
          {stats.map(([value, label]) => (
            <View key={label} style={styles.statCol}>
              {/* The value slot keeps statLg's 44pt line box either way — a
                  shorter skeleton would shrink the gradient, drag the concave
                  seam up, and shift the whole page when the number lands. */}
              <View style={styles.statValueSlot}>
                {loading ? (
                  <Skeleton width={44} height={26} tone="onBrand" />
                ) : (
                  <AppText variant="statLg" color="textInverse">
                    {value}
                  </AppText>
                )}
              </View>
              {/* The label is known copy — greying it out would cost shape and
                  tell the user less than the truth. */}
              <AppText variant="label" color="rgba(255,255,255,0.7)">
                {label}
              </AppText>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* The page scoops up into the sky — an organic seam, not a box edge. */}
      <Svg
        width="100%"
        height={44}
        viewBox="0 0 100 44"
        preserveAspectRatio="none"
        style={styles.curve}
      >
        <Ellipse cx={50} cy={112} rx={82} ry={86} fill={colors.bg} />
      </Svg>
    </View>
  );
}

function CalendarBlock() {
  const { colors } = useTheme();
  const styles = useStyles();
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
  const styles = useStyles();
  const { plan, status: planStatus } = usePlan();
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
            // Only claim a day is untrained once the plan actually says so —
            // while it's in flight every dot would read false and then pop in.
            const hasWorkout =
              planStatus === 'ready' &&
              (plan?.workouts.some((w) => w.dayLabel === dayLabel) ?? false);
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
  series,
  loading,
  onMetricChange,
  onPickExercise,
}: {
  exerciseId: string;
  metric: Metric;
  series: SeriesPoint[];
  loading: boolean;
  onMetricChange: (m: Metric) => void;
  onPickExercise: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { user } = useUser();
  // Falling back to mockExercises[0] would label this chart "Barbell Bench
  // Press" and draw someone else's numbers under it. Resolve properly instead —
  // an unknown id yields a generic entry that at least carries the right name.
  const ex = resolvePlannedExercise(exerciseId);

  // Real logged history only, as daily points for the interactive chart.
  //
  // The server computes both metrics from stored weights, which are kilograms
  // (migration 017) — estimated 1RM directly, volume as reps x weight. Both
  // therefore scale with the unit, and both need converting for a lbs user.
  // The body-weight chart below has always done this; this one didn't, because
  // the stored unit used to be whatever the user happened to log in.
  const points = useMemo(
    () =>
      series.map((p) => ({
        day: p.date,
        value:
          user.units === 'kg'
            ? Math.round(p.value * 10) / 10
            : Math.round(kgToLbs(p.value) * 10) / 10,
      })),
    [series, user.units],
  );

  const hasEnough = points.length >= 2;
  const diff = hasEnough
    ? Math.round(points[points.length - 1].value - points[0].value)
    : 0;
  const up = diff >= 0;
  const unit = user.units === 'kg' ? 'kg' : 'lbs';

  // 1RMs move by pounds, volume by hundreds — the pad scales with the series.
  const values = points.map((d) => d.value);
  const pad =
    metric === 'strength'
      ? 10
      : Math.max(200, (Math.max(...values, 0) - Math.min(...values, 0)) * 0.1);

  return (
    <ChartCard
      title="Exercise trends"
      subtitle={metric === 'strength' ? 'Estimated 1RM' : 'Daily weight moved'}
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
        {hasEnough ? (
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
        ) : (
          <View />
        )}
      </View>

      <Pressable onPress={onPickExercise} style={styles.pickerButton}>
        <View style={styles.pickerLeft}>
          <Ionicons name="barbell-outline" size={16} color={colors.accentText} />
          <AppText variant="bodyMedium">{ex.name}</AppText>
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
      </Pressable>

      {/* Loading first — otherwise an unloaded series falls through to
          "No history yet", which reads as "your workouts weren't saved". */}
      {loading ? (
        <ChartSkeleton height={160} />
      ) : hasEnough ? (
        <TrendChart
          points={points}
          tone={metric === 'strength' ? 'primary' : 'secondary'}
          width={CHART_W}
          height={160}
          pad={pad}
          formatValue={(v) => `${Math.round(v).toLocaleString()} ${unit}`}
          aggregate={metric === 'strength' ? 'max' : 'avg'}
        />
      ) : points.length === 1 ? (
        // A trend needs two training days — but "No history yet" over a real
        // logged workout reads as "it wasn't saved". Show the number instead.
        <View style={styles.firstPoint}>
          <AppText variant="statLg">
            {Math.round(points[0].value).toLocaleString()} {unit}
          </AppText>
          <AppText variant="caption" color="textSecondary" align="center">
            {metric === 'strength' ? 'Est. 1RM' : 'Total moved'} ·{' '}
            {new Date(points[0].day).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
            {'\n'}One more session and your trend line appears.
          </AppText>
        </View>
      ) : (
        <EmptyState
          icon="trending-up"
          title="No history yet"
          message={`Log ${ex.name} in a couple of workouts and your trend appears here.`}
        />
      )}
    </ChartCard>
  );
}

// A chart's footprint, not a chart's likeness. One filled rectangle at 160pt is
// a lot of flat grey; bars anchored to the baseline read as "a chart is coming"
// while occupying exactly the space the real chart will take, so nothing shifts.
const SKELETON_BAR_RATIOS = [0.35, 0.62, 0.45, 0.78, 0.55, 0.9, 0.68];

function ChartSkeleton({ height }: { height: number }) {
  const styles = useStyles();
  return (
    <View style={[styles.chartSkeleton, { height }]}>
      <View style={styles.chartSkeletonBars}>
        {SKELETON_BAR_RATIOS.map((r, i) => (
          <Skeleton key={i} height={Math.round((height - 24) * r)} style={{ flex: 1 }} />
        ))}
      </View>
      <View style={styles.chartSkeletonAxis}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width={28} height={10} />
        ))}
      </View>
    </View>
  );
}

function BodyWeightBlock({
  points,
  loading,
}: {
  points: BodyWeightPoint[];
  loading: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { user } = useUser();
  const metricUnits = user.units === 'kg';

  const data = useMemo(
    () =>
      points.map((p) => ({
        day: p.day,
        value: +(metricUnits ? p.weight_kg : kgToLbs(p.weight_kg)).toFixed(1),
      })),
    [points, metricUnits],
  );

  const hasEnough = data.length >= 2;
  const latest = data.length ? data[data.length - 1].value : null;
  const diff = hasEnough ? +(data[data.length - 1].value - data[0].value).toFixed(1) : 0;
  const up = diff >= 0;

  return (
    <ChartCard
      title="Body weight"
      subtitle={loading || hasEnough ? undefined : 'Track your weight over time'}
    >
      {/* Loading first: "no entries yet" must only be said once we know it. */}
      {loading ? (
        <ChartSkeleton height={140} />
      ) : hasEnough ? (
        <>
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
                {diff} {user.units}
              </AppText>
            </View>
          </View>
          <TrendChart
            points={data}
            tone="hot"
            width={CHART_W}
            height={140}
            pad={metricUnits ? 10 : 20}
            formatValue={(v) => `${v.toFixed(1)} ${user.units}`}
            aggregate="avg"
          />
        </>
      ) : latest != null ? (
        // Exactly one entry: acknowledge it and say what draws the line.
        <EmptyState
          icon="scale-outline"
          title={`${latest.toFixed(1)} ${user.units} logged`}
          message="Log tomorrow's weight and your trend line appears here."
        />
      ) : (
        <EmptyState
          icon="scale-outline"
          title="No entries yet"
          message="Add today's weight on the Plan tab — a couple of entries draw the trend."
        />
      )}
    </ChartCard>
  );
}

const useStyles = makeStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.bg },
  content: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
    gap: spacing.lg,
  },
  // Full-bleed: escape the scroll content's gutter on both sides.
  header: {
    marginHorizontal: -layout.SCREEN_H_PADDING,
  },
  headerGradient: {
    alignItems: 'center',
    paddingHorizontal: layout.SCREEN_H_PADDING,
    // Room for the concave curve to scoop into.
    paddingBottom: spacing.xxxl + spacing.lg,
  },
  menuBtn: {
    alignSelf: 'flex-end',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  handle: { marginTop: spacing.xxs },
  statsRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    justifyContent: 'space-evenly',
    marginTop: spacing.xl,
  },
  statCol: { alignItems: 'center', gap: spacing.xs },
  // Matches textVariants.statLg's lineHeight so the skeleton and the real
  // number occupy identical space.
  statValueSlot: { height: 44, justifyContent: 'center' },
  chartSkeleton: { justifyContent: 'flex-end', gap: spacing.sm },
  chartSkeletonBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    flex: 1,
  },
  chartSkeletonAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  curve: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
    backgroundColor: t.colors.bgSubtle,
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
  dayBubbleToday: { backgroundColor: t.colors.accent },
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
    backgroundColor: t.colors.accent,
  },
  trendControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: t.colors.sunken,
    borderRadius: radius.pill,
    padding: 3,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
  },
  segmentActive: {
    backgroundColor: t.colors.card,
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
    backgroundColor: t.colors.bgSubtle,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  pickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  firstPoint: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
}));

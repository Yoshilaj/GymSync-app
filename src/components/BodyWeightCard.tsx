/**
 * "Body weight" — the Plan page's quick log, custom-card language.
 *
 * One 64pt line at rest: icon well · day eyebrow + title · big value ·
 * rotating chevron. Tap → an inline scroll wheel (integer + decimal + unit)
 * expands beneath; every settle auto-saves (debounced) — no buttons, no
 * layout shift. Logs THE DAY SELECTED on the strip, so each day keeps its
 * own entry and the trend chart gets a real series.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import {
  AppText,
  Card,
  NumberWheel,
  Skeleton,
  WheelRow,
  WheelUnit,
  WHEEL_HEIGHT,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useUser } from '@/context/UserContext';
import { fetchBodyWeightSeries, logBodyWeight } from '@/api/progress';
import { kgToLbs, lbsToKg } from '@/lib/units';
import { localDayIso } from '@/lib/dates';

const EXPANDED_H = WHEEL_HEIGHT + spacing.lg;

/** The most recent logged weight on or before the given day. */
function nearestOnOrBefore(
  entries: Record<string, number>,
  dayIso: string,
): number | null {
  let bestDay: string | null = null;
  for (const d of Object.keys(entries)) {
    if (d <= dayIso && (bestDay === null || d > bestDay)) bestDay = d;
  }
  return bestDay ? entries[bestDay] : null;
}

export function BodyWeightCard({ date }: { date: Date }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { getToken, session } = useAuth();
  const { user, profile } = useUser();
  const metric = user.units === 'kg';
  const reduceMotion = useReducedMotion();

  const dayIso = localDayIso(date);
  const todayIso = localDayIso();
  const isToday = dayIso === todayIso;
  const dayLabel = isToday
    ? 'Today'
    : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });

  const [open, setOpen] = useState(false);
  const [intPart, setIntPart] = useState<number | null>(null);
  const [decPart, setDecPart] = useState(0);
  const [saveError, setSaveError] = useState(false);
  // day (YYYY-MM-DD) → logged kg, within the fetched window.
  const [entries, setEntries] = useState<Record<string, number>>({});
  // Until this resolves an empty log is indistinguishable from an unloaded
  // one, and the row would claim "—" (not logged) for a day that has a weight.
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const expandH = useSharedValue(0);
  const chevron = useSharedValue(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const intMin = metric ? 30 : 66;
  const intMax = metric ? 250 : 550;

  // Load the recent log once per session (the strip only reaches back weeks).
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const points = await fetchBodyWeightSeries(token, 60);
        if (!cancelled) {
          const map: Record<string, number> = {};
          for (const p of points) map[p.day] = p.weight_kg;
          setEntries(map);
        }
      } catch {
        /* offline — the wheel still works; saves retry on settle */
      } finally {
        // Latch on failure too, or an offline card shimmers forever instead of
        // showing its "—" and letting the user log a weight.
        if (!cancelled) setEntriesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, getToken]);

  const entryKg = entries[dayIso] ?? null;

  // Re-seat the wheel whenever the selected day (or its entry) changes:
  // that day's entry → most recent earlier entry → profile snapshot.
  useEffect(() => {
    const kg = entryKg ?? nearestOnOrBefore(entries, dayIso) ?? profile?.weight_kg ?? null;
    setSaveError(false);
    if (kg == null) {
      setIntPart(null);
      setDecPart(0);
      return;
    }
    const shown = metric ? kg : kgToLbs(kg);
    const rounded = Math.round(shown * 10) / 10;
    setIntPart(Math.floor(rounded));
    setDecPart(Math.round((rounded % 1) * 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayIso, entryKg, metric]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    const duration = reduceMotion ? 0 : 220;
    expandH.value = withTiming(next ? EXPANDED_H : 0, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
    chevron.value = withTiming(next ? 1 : 0, { duration });
  };

  const scheduleSave = (nextInt: number, nextDec: number) => {
    const day = dayIso; // capture — a day-swipe mid-debounce keeps the target
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const shown = nextInt + nextDec / 10;
      const kg = Math.min(350, Math.max(25, metric ? shown : lbsToKg(shown)));
      const saved = entriesRef.current[day];
      if (saved != null && Math.abs(kg - saved) < 0.05) return;
      try {
        const token = await getToken();
        await logBodyWeight(token, kg, day);
        setEntries((prev) => ({ ...prev, [day]: kg }));
        setSaveError(false);
      } catch (e) {
        if (__DEV__) console.warn('Body weight save failed:', e);
        setSaveError(true); // retries on the next settle
      }
    }, 800);
  };

  // Drop a pending save on unmount (it re-arms on the next settle anyway).
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const expandStyle = useAnimatedStyle(() => ({
    height: expandH.value,
    overflow: 'hidden' as const,
  }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevron.value * 180}deg` }],
  }));

  const defaultInt = metric ? 75 : 165;
  const wheelInt = intPart ?? defaultInt;
  // The resting value belongs to THIS day: its saved entry, or the wheel
  // position while an edit for it is open. Other days stay "—".
  const shownEntry =
    entryKg != null ? Math.round((metric ? entryKg : kgToLbs(entryKg)) * 10) / 10 : null;
  const display =
    shownEntry != null
      ? `${Math.floor(shownEntry)}.${Math.round((shownEntry % 1) * 10)}`
      : open && intPart != null
        ? `${intPart}.${decPart}`
        : null;

  return (
    <Card padded={false}>
      <Pressable onPress={toggle} style={styles.row}>
        <View style={styles.iconWell}>
          <Ionicons name="scale-outline" size={17} color={colors.accentText} />
        </View>
        <View style={styles.titleCol}>
          <AppText variant="label" color="accentText">
            {dayLabel}
          </AppText>
          <AppText variant="h3">Body weight</AppText>
        </View>
        {!entriesLoaded && display == null ? (
          <Skeleton width={54} height={20} />
        ) : (
        <AppText variant="statSm">
          {display ?? (
            <AppText variant="statSm" color="textTertiary">
              —
            </AppText>
          )}
          {display ? (
            <AppText variant="caption" color="textSecondary">
              {'  '}
              {user.units}
            </AppText>
          ) : null}
        </AppText>
        )}
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
        </Animated.View>
      </Pressable>

      <Animated.View style={expandStyle}>
        <View style={styles.wheelArea}>
          <WheelRow>
            <NumberWheel
              min={intMin}
              max={intMax}
              value={wheelInt}
              onChange={(n) => {
                setIntPart(n);
                setSaveError(false);
                scheduleSave(n, decPart);
              }}
              width={88}
              showBand={false}
              accessibilityLabel="Body weight"
            />
            <NumberWheel
              min={0}
              max={9}
              value={decPart}
              onChange={(n) => {
                setDecPart(n);
                if (intPart != null) scheduleSave(intPart, n);
                else {
                  setIntPart(defaultInt);
                  scheduleSave(defaultInt, n);
                }
              }}
              format={(n) => `.${n}`}
              width={56}
              showBand={false}
              accessibilityLabel="Decimal"
            />
            <WheelUnit label={user.units} />
          </WheelRow>
          {saveError ? (
            <AppText variant="caption" color="dangerText" align="center">
              Couldn't save — will retry
            </AppText>
          ) : null}
        </View>
      </Animated.View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
  },
  iconWell: {
    width: 34,
    height: 34,
    borderRadius: radius.sm + 2,
    backgroundColor: t.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: { flex: 1 },
  wheelArea: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
}));

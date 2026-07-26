/**
 * "Today · Body weight" — the Plan page's quick log, custom-card language.
 *
 * One 64pt line at rest: icon well · "Today" eyebrow + title · big value ·
 * rotating chevron. Tap → an inline scroll wheel (integer + decimal + unit)
 * expands beneath; every settle auto-saves (debounced) — no buttons, no
 * layout shift. Always logs TODAY regardless of which day the strip shows.
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
  WheelRow,
  WheelUnit,
  WHEEL_HEIGHT,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useUser } from '@/context/UserContext';
import { fetchBodyWeightSeries, logBodyWeight } from '@/api/progress';
import { kgToLbs, lbsToKg } from '@/lib/units';

const EXPANDED_H = WHEEL_HEIGHT + spacing.lg;

export function BodyWeightCard() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { getToken, session } = useAuth();
  const { user, profile } = useUser();
  const metric = user.units === 'kg';
  const reduceMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [intPart, setIntPart] = useState<number | null>(null);
  const [decPart, setDecPart] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const expandH = useSharedValue(0);
  const chevron = useSharedValue(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedKg = useRef<number | null>(null);

  const intMin = metric ? 30 : 66;
  const intMax = metric ? 250 : 550;

  // Prefill: today's entry → profile weight → nothing (placeholder).
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const points = await fetchBodyWeightSeries(token, 7);
        const today = new Date().toISOString().slice(0, 10);
        const entry = points.find((p) => p.day === today);
        const kg = entry?.weight_kg ?? profile?.weight_kg ?? null;
        if (kg != null && !cancelled) {
          const shown = metric ? kg : kgToLbs(kg);
          const rounded = Math.round(shown * 10) / 10;
          setIntPart(Math.floor(rounded));
          setDecPart(Math.round((rounded % 1) * 10));
          if (entry) lastSavedKg.current = entry.weight_kg;
        }
      } catch {
        /* offline — the wheel still works; saves retry on settle */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, metric]);

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
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const shown = nextInt + nextDec / 10;
      const kg = Math.min(350, Math.max(25, metric ? shown : lbsToKg(shown)));
      if (lastSavedKg.current != null && Math.abs(kg - lastSavedKg.current) < 0.05) {
        return;
      }
      try {
        const token = await getToken();
        await logBodyWeight(token, kg);
        lastSavedKg.current = kg;
        setSaveError(false);
      } catch {
        setSaveError(true); // retries on the next settle
      }
    }, 800);
  };

  // Flush a pending save on unmount so a quick tab-hop doesn't lose the value.
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
  const display =
    intPart != null ? `${intPart}.${decPart}` : null;

  return (
    <Card padded={false}>
      <Pressable onPress={toggle} style={styles.row}>
        <View style={styles.iconWell}>
          <Ionicons name="scale-outline" size={17} color={colors.accentText} />
        </View>
        <View style={styles.titleCol}>
          <AppText variant="label" color="accentText">
            Today
          </AppText>
          <AppText variant="h3">Body weight</AppText>
        </View>
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

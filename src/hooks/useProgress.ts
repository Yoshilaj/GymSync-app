/**
 * Real progress data for the Progress tab: summary stats, the selected
 * exercise's trend series, and the body-weight log. Refreshes whenever the
 * tab regains focus so freshly-logged sets show up immediately.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '@/auth/AuthContext';
import { getExerciseById } from '@/data/mockExercises';
import {
  PROGRESS_BODYWEIGHT_KEY,
  PROGRESS_SUMMARY_KEY,
} from '@/lib/storageKeys';
import {
  fetchBodyWeightSeries,
  fetchExerciseSeries,
  fetchProgressSummary,
  type BodyWeightPoint,
  type ProgressSummary,
  type SeriesPoint,
} from '@/api/progress';

// Fetch the full useful window once — the interactive chart pans/zooms
// client-side. Body weight is a years-long story; exercise history caps at a
// year (it resets with plan changes).
const BODY_WEIGHT_DAYS = 1095;
const EXERCISE_DAYS = 365;

/** Owner-stamped read cache (same rule as profile/plan — see storageKeys.ts).
 * Without it, an offline cold start rendered an established user's Progress
 * tab as a fresh account: zero streak, "No history yet". */
async function readCache<T>(key: string, owner: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { owner?: string; data?: T };
    return parsed.owner === owner && parsed.data !== undefined ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, owner: string, data: unknown): void {
  AsyncStorage.setItem(key, JSON.stringify({ owner, data })).catch(() => {});
}

export function useProgress(exerciseId: string, metric: 'strength' | 'volume') {
  const { session, getToken } = useAuth();
  const focused = useIsFocused();

  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [bodyWeight, setBodyWeight] = useState<BodyWeightPoint[]>([]);
  const [series, setSeries] = useState<SeriesPoint[]>([]);

  /**
   * Loading is tracked per fetch, not once for the hook: a single flag would
   * hold the whole screen hostage to the slowest of the three requests.
   *
   * Each latch records "this has resolved at least once", so the focus-driven
   * refetch above never re-shows a skeleton over data we already have — the
   * screen refreshes silently and only a genuine cold start looks like loading.
   */
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [bodyWeightLoaded, setBodyWeightLoaded] = useState(false);
  // Keyed by exercise, so picking a different lift DOES show a skeleton again —
  // that's a real load. Deliberately NOT keyed by metric: the Strength/Volume
  // toggle should feel like a filter flipping, not a page loading.
  const [seriesLoadedFor, setSeriesLoadedFor] = useState<string | null>(null);

  /**
   * Bumped to force all three fetches to re-run — the hook's fetches key on
   * focus, so without this the only way to retry a failed load was to leave the
   * tab and come back. Pull-to-refresh drives it.
   */
  const [reloadNonce, setReloadNonce] = useState(0);
  const refresh = useCallback(async () => {
    setReloadNonce((n) => n + 1);
    // The fetches are fire-and-forget effects, so there's nothing to await. Give
    // the spinner a beat rather than snapping it away before anything lands.
    await new Promise((r) => setTimeout(r, 600));
  }, []);

  // Cache-FIRST, not cache-on-failure: last-known stats render immediately —
  // offline included — and a successful fetch silently overwrites, exactly the
  // "refresh without re-showing a skeleton" behavior the latches document.
  // The failure-path reads below stay as a second net, but this hydration is
  // what makes airplane-mode cold starts show data instead of waiting for the
  // network stack to finish failing.
  useEffect(() => {
    if (!session) return;
    const owner = session.user.id;
    let cancelled = false;
    void (async () => {
      const [s, bw] = await Promise.all([
        readCache<ProgressSummary>(PROGRESS_SUMMARY_KEY, owner),
        readCache<BodyWeightPoint[]>(PROGRESS_BODYWEIGHT_KEY, owner),
      ]);
      if (cancelled) return;
      if (s) {
        setSummary((prev) => prev ?? s);
        setSummaryLoaded(true);
      }
      if (bw) {
        setBodyWeight((prev) => (prev.length > 0 ? prev : bw));
        setBodyWeightLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]); // id, not the session object — its identity churns

  useEffect(() => {
    if (!session || !focused) return;
    const owner = session.user.id;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const s = await fetchProgressSummary(token);
        if (!cancelled) {
          setSummary(s);
          writeCache(PROGRESS_SUMMARY_KEY, owner, s);
        }
      } catch {
        // Offline: fall back to the last summary this account saw, so the tab
        // shows real (if stale) numbers instead of a fresh-account zero state.
        const cached = await readCache<ProgressSummary>(PROGRESS_SUMMARY_KEY, owner);
        if (!cancelled && cached) setSummary((prev) => prev ?? cached);
      } finally {
        // Latch in `finally`, not on success: an offline failure has to end the
        // skeleton too, or the screen shimmers forever instead of falling
        // through to its empty state.
        if (!cancelled) setSummaryLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, focused, getToken, reloadNonce]);

  useEffect(() => {
    if (!session || !focused) return;
    const owner = session.user.id;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const bw = await fetchBodyWeightSeries(token, BODY_WEIGHT_DAYS);
        if (!cancelled) {
          setBodyWeight(bw);
          writeCache(PROGRESS_BODYWEIGHT_KEY, owner, bw);
        }
      } catch {
        const cached = await readCache<BodyWeightPoint[]>(
          PROGRESS_BODYWEIGHT_KEY,
          owner,
        );
        if (!cancelled && cached) {
          setBodyWeight((prev) => (prev.length > 0 ? prev : cached));
        }
      } finally {
        if (!cancelled) setBodyWeightLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, focused, getToken, reloadNonce]);

  useEffect(() => {
    if (!session || !focused) return;
    // Wait for the summary before fetching any series. The screen opens on a
    // default exercise and then re-points itself at whatever was trained most
    // recently — firing now would load the default, render it, and immediately
    // load again, so the user watches two skeletons instead of one.
    if (!summaryLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        // Pass the display name so the server matches by exercise_name — the
        // filter that finds voice-logged sets (their exercise_id is often
        // NULL, and the catalog id namespaces have drifted).
        const points = await fetchExerciseSeries(
          token,
          exerciseId,
          metric,
          EXERCISE_DAYS,
          getExerciseById(exerciseId)?.name,
        );
        if (!cancelled) setSeries(points);
      } catch {
        /* offline — keep last known values */
      } finally {
        if (!cancelled) setSeriesLoadedFor(exerciseId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, focused, summaryLoaded, exerciseId, metric, getToken, reloadNonce]);

  return {
    summary,
    bodyWeight,
    series,
    refresh,
    summaryLoading: !summaryLoaded,
    bodyWeightLoading: !bodyWeightLoaded,
    seriesLoading: seriesLoadedFor !== exerciseId,
  };
}

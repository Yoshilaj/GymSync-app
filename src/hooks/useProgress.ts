/**
 * Real progress data for the Progress tab: summary stats, the selected
 * exercise's trend series, and the body-weight log. Refreshes whenever the
 * tab regains focus so freshly-logged sets show up immediately.
 */
import { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '@/auth/AuthContext';
import { getExerciseById } from '@/data/mockExercises';
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

  useEffect(() => {
    if (!session || !focused) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const s = await fetchProgressSummary(token);
        if (!cancelled) setSummary(s);
      } catch {
        /* offline — keep last known values */
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
  }, [session, focused, getToken]);

  useEffect(() => {
    if (!session || !focused) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const bw = await fetchBodyWeightSeries(token, BODY_WEIGHT_DAYS);
        if (!cancelled) setBodyWeight(bw);
      } catch {
        /* offline — keep last known values */
      } finally {
        if (!cancelled) setBodyWeightLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, focused, getToken]);

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
  }, [session, focused, summaryLoaded, exerciseId, metric, getToken]);

  return {
    summary,
    bodyWeight,
    series,
    summaryLoading: !summaryLoaded,
    bodyWeightLoading: !bodyWeightLoaded,
    seriesLoading: seriesLoadedFor !== exerciseId,
  };
}

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
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, focused, exerciseId, metric, getToken]);

  return { summary, bodyWeight, series };
}

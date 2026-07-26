/**
 * Real progress data for the Progress tab: summary stats, the selected
 * exercise's trend series, and the body-weight log. Refreshes whenever the
 * tab regains focus so freshly-logged sets show up immediately.
 */
import { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '@/auth/AuthContext';
import {
  fetchBodyWeightSeries,
  fetchExerciseSeries,
  fetchProgressSummary,
  type BodyWeightPoint,
  type ProgressSummary,
  type SeriesPoint,
} from '@/api/progress';

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
        const [s, bw] = await Promise.all([
          fetchProgressSummary(token),
          fetchBodyWeightSeries(token),
        ]);
        if (!cancelled) {
          setSummary(s);
          setBodyWeight(bw);
        }
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
        const points = await fetchExerciseSeries(token, exerciseId, metric);
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

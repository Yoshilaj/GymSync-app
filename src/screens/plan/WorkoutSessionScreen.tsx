import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Button, Card, Chip } from '@/components/ui';
import { SetRow } from '@/components/SetRow';
import { VoiceButton } from '@/components/VoiceButton';
import { VoiceWaveform } from '@/components/VoiceWaveform';
import { ExerciseImage } from '@/components/ExerciseImage';
import { RestRing } from '@/components/RestRing';
import { SessionToasts, SessionToast } from '@/components/SessionToasts';
import { getExerciseById, getExerciseByName } from '@/data/mockExercises';
import { logCompletedSet } from '@/api/progress';
import { useUser } from '@/context/UserContext';
import { usePlan } from '@/context/PlanContext';
import { useAuth } from '@/auth/AuthContext';
import {
  useVoiceSession,
  useWorkoutSession,
  useSessionActions,
  formatClock,
  makeShimmerSource,
  voicePlayer,
  type AppActionMessage,
  type PlanChange,
  type SessionResume,
  type VoicePhase,
} from '@/voice';
import { Exercise, PlannedSet } from '@/types';
import { PlanStackParamList } from '@/navigation/PlanStack';

type Nav = NativeStackNavigationProp<PlanStackParamList, 'WorkoutSession'>;
type RouteP = RouteProp<PlanStackParamList, 'WorkoutSession'>;

const DEFAULT_REST_SECONDS = 90;

/** One exercise in the live session — planned, coach-added, or coach-swapped. */
interface SessionExercise {
  key: string;
  name: string;
  meta?: Exercise;
  sets: PlannedSet[];
  note?: string;
  addedBySync?: boolean;
}

const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: '',
  connecting: 'Connecting to Sync…',
  listening: 'Listening',
  thinking: 'Sync is thinking…',
  coach_speaking: 'Sync is speaking',
  error: 'Voice unavailable',
};

let setSeq = 0;
function newSetId(): string {
  setSeq += 1;
  return `live-${Date.now()}-${setSeq}`;
}

function matchesName(candidate: string, target: string): boolean {
  const a = candidate.trim().toLowerCase();
  const b = target.trim().toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

export function WorkoutSessionScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteP>();
  const { user } = useUser();
  const { user: authUser, getToken } = useAuth();

  const { plan, todaysWorkout, getWorkoutById } = usePlan();

  // Real plan lookup; a session opened with no plan gets an empty free-form
  // workout shell (the voice coach can still add exercises / log sets).
  const workout = useMemo(
    () =>
      (route.params?.workoutId
        ? getWorkoutById(route.params.workoutId)
        : undefined) ??
      todaysWorkout ?? {
        id: 'freeform',
        dayLabel: '',
        title: 'Open workout',
        estMinutes: 45,
        exercises: [],
      },
    [route.params?.workoutId, getWorkoutById, todaysWorkout],
  );

  // Lazy initializer: the plan is read ONCE, at mount. Editing the plan mid
  // session (Plan tab add/delete) deliberately doesn't reach in here — the
  // list must not shift under someone who's between sets.
  const [exercises, setExercises] = useState<SessionExercise[]>(() =>
    workout.exercises.map((pe) => {
      const meta = getExerciseById(pe.exerciseId);
      return {
        key: pe.id ?? pe.exerciseId,
        name: meta?.name ?? pe.name ?? pe.exerciseId,
        meta,
        sets: pe.sets.map((s) => ({ ...s })),
        note: pe.note,
      };
    }),
  );
  const [exerciseIdx, setExerciseIdx] = useState(0);
  const exerciseIdxRef = useRef(0);
  exerciseIdxRef.current = exerciseIdx;
  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;

  // A coach `remove` can delete the current/last exercise — keep the index
  // pointing at a real card.
  useEffect(() => {
    if (exercises.length > 0 && exerciseIdx > exercises.length - 1) {
      setExerciseIdx(exercises.length - 1);
    }
  }, [exercises.length, exerciseIdx]);

  const [toasts, setToasts] = useState<SessionToast[]>([]);
  const [planChanges, setPlanChanges] = useState<PlanChange[] | null>(null);
  const [planBannerOpen, setPlanBannerOpen] = useState(false);
  const [restExpanded, setRestExpanded] = useState(false);
  // Which set's weight wheel is open — one at a time, per current exercise.
  const [weightEditIdx, setWeightEditIdx] = useState<number | null>(null);
  useEffect(() => {
    setWeightEditIdx(null);
  }, [exerciseIdx]);
  // Bottom edge of the header in the popover's coordinate space. Absolute
  // children position against the parent's border box, which ignores the
  // safe-area padding the header flows below — so track y + height, not height.
  const [headerBottom, setHeaderBottom] = useState(0);

  const actions = useSessionActions();
  const { timer } = actions.state;

  const pushToast = useCallback(
    (text: string, icon?: SessionToast['icon']) => {
      setToasts((prev) => [
        ...prev,
        { id: `t-${Date.now()}-${prev.length}`, text, icon },
      ]);
    },
    [],
  );
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---- Live coach actions ---------------------------------------------------

  const applyLogSet = useCallback(
    (action: Extract<AppActionMessage, { action: 'log_set' }>) => {
      setExercises((prev) => {
        const idx = prev.findIndex((ex) => matchesName(ex.name, action.exercise));
        if (idx === -1) {
          // Unknown exercise — never mis-check a planned row; add it as extra work.
          const meta = getExerciseByName(action.exercise);
          return [
            ...prev,
            {
              key: `extra-${newSetId()}`,
              name: meta?.name ?? action.exercise,
              meta,
              addedBySync: true,
              sets: [
                {
                  id: newSetId(),
                  exerciseId: meta?.id ?? '',
                  targetReps: action.reps,
                  weight: action.weight ?? 0,
                  achievedReps: action.reps,
                  completed: true,
                },
              ],
            },
          ];
        }
        return prev.map((ex, i) => {
          if (i !== idx) return ex;
          // The server's set_index is authoritative — it's the slot the DB row
          // was actually written to (and re-writing the same slot is naturally
          // idempotent). Older servers omit it; fall back to first-open.
          const firstOpen = ex.sets.findIndex((s) => !s.completed);
          const target = action.set_index ?? firstOpen;
          if (target < 0 || target >= ex.sets.length) {
            // Beyond the planned rows — the coach logged a bonus set.
            const last = ex.sets[ex.sets.length - 1];
            return {
              ...ex,
              sets: [
                ...ex.sets,
                {
                  id: newSetId(),
                  exerciseId: last?.exerciseId ?? '',
                  targetReps: action.reps,
                  weight: action.weight ?? last?.weight ?? 0,
                  achievedReps: action.reps,
                  completed: true,
                },
              ],
            };
          }
          return {
            ...ex,
            sets: ex.sets.map((s, si) =>
              si === target
                ? {
                    ...s,
                    achievedReps: action.reps,
                    weight: action.weight ?? s.weight,
                    completed: true,
                  }
                : s,
            ),
          };
        });
      });
      const corrected = action.mode === 'corrected';
      // A correction rewrites history — the user isn't starting a new rest.
      if (!corrected) actions.startRest(DEFAULT_REST_SECONDS);
      const detail =
        action.weight != null
          ? `${action.reps} × ${action.weight}`
          : `${action.reps} reps`;
      pushToast(
        corrected
          ? `Fixed set ${(action.set_index ?? 0) + 1} — ${detail}`
          : `${action.exercise} — ${detail}`,
      );
    },
    [actions.startRest, pushToast],
  );

  const applySwap = useCallback(
    (action: Extract<AppActionMessage, { action: 'swap_exercise' }>) => {
      setExercises((prev) =>
        prev.map((ex) => {
          if (!matchesName(ex.name, action.from)) return ex;
          const meta = getExerciseByName(action.to);
          return {
            ...ex,
            name: meta?.name ?? action.to,
            meta,
            // Keep the set count; unfinished sets carry over unchecked.
            sets: ex.sets.map((s) =>
              s.completed ? s : { ...s, achievedReps: undefined },
            ),
          };
        }),
      );
      pushToast(`Swapped ${action.from} → ${action.to}`, 'swap-horizontal');
    },
    [pushToast],
  );

  const applyAdd = useCallback(
    (action: Extract<AppActionMessage, { action: 'add_exercise' }>) => {
      setExercises((prev) => {
        const meta = getExerciseByName(action.exercise);
        const insertAt = Math.min(exerciseIdxRef.current + 1, prev.length);
        const added: SessionExercise = {
          key: `added-${newSetId()}`,
          name: meta?.name ?? action.exercise,
          meta,
          addedBySync: true,
          sets: Array.from({ length: 3 }, () => ({
            id: newSetId(),
            exerciseId: meta?.id ?? '',
            targetReps: 10,
            weight: 0,
          })),
        };
        return [...prev.slice(0, insertAt), added, ...prev.slice(insertAt)];
      });
      pushToast(`Added ${action.exercise}`, 'add-circle');
    },
    [pushToast],
  );

  const applyModifyPlan = useCallback(
    (action: Extract<AppActionMessage, { action: 'modify_plan' }>) => {
      setPlanChanges(action.changes);
      // The current exercise and everything after it are fair game to mutate —
      // "I'll only do 3 sets of these" means the card on screen. Only exercises
      // the user already finished and moved past stay untouchable.
      setExercises((prev) => {
        const startAt = exerciseIdxRef.current;
        let next = [...prev];
        for (const change of action.changes) {
          if (change.op === 'add' && change.exercise_name) {
            const meta = getExerciseByName(change.exercise_name);
            next.push({
              key: `plan-${newSetId()}`,
              name: meta?.name ?? change.exercise_name,
              meta,
              addedBySync: true,
              sets: Array.from({ length: change.sets ?? 3 }, () => ({
                id: newSetId(),
                exerciseId: meta?.id ?? '',
                targetReps: change.reps ?? 10,
                weight: 0,
              })),
            });
          } else if (change.op === 'remove' && change.exercise_name) {
            // Mirror the server rule: a started exercise keeps its logged sets
            // (renders as done); only an untouched one disappears outright.
            next = next.flatMap((ex, i) => {
              if (i < startAt || !matchesName(ex.name, change.exercise_name!)) {
                return [ex];
              }
              const done = ex.sets.filter((s) => s.completed);
              return done.length > 0 ? [{ ...ex, sets: done }] : [];
            });
          } else if (change.op === 'replace' && change.exercise_name && change.to_exercise) {
            next = next.map((ex, i) => {
              if (i < startAt || !matchesName(ex.name, change.exercise_name!)) return ex;
              const meta = getExerciseByName(change.to_exercise!);
              return { ...ex, name: meta?.name ?? change.to_exercise!, meta };
            });
          } else if (change.op === 'adjust' && change.exercise_name) {
            next = next.map((ex, i) => {
              if (i < startAt || !matchesName(ex.name, change.exercise_name!)) return ex;
              let sets = ex.sets;
              if (change.sets != null && change.sets !== sets.length) {
                sets =
                  change.sets < sets.length
                    ? sets.slice(0, Math.max(change.sets, sets.filter((s) => s.completed).length))
                    : [
                        ...sets,
                        ...Array.from({ length: change.sets - sets.length }, () => ({
                          id: newSetId(),
                          exerciseId: sets[0]?.exerciseId ?? '',
                          targetReps: change.reps ?? sets[0]?.targetReps ?? 10,
                          weight: sets[0]?.weight ?? 0,
                        })),
                      ];
              }
              if (change.reps != null) {
                sets = sets.map((s) => (s.completed ? s : { ...s, targetReps: change.reps! }));
              }
              return { ...ex, sets };
            });
          }
        }
        return next;
      });
      pushToast("Sync updated today's plan", 'document-text');
    },
    [pushToast],
  );

  const applyGoTo = useCallback(
    (action: Extract<AppActionMessage, { action: 'go_to_exercise' }>) => {
      const idx = exercisesRef.current.findIndex((ex) =>
        matchesName(ex.name, action.exercise),
      );
      if (idx === -1 || idx === exerciseIdxRef.current) return;
      setExerciseIdx(idx);
      actions.skipRest();
      // The server already wrote current_exercise for this move — no PATCH here.
      pushToast(`Up: ${action.exercise}`, 'arrow-forward');
    },
    [actions, pushToast],
  );

  const handleAppAction = useCallback(
    (action: AppActionMessage) => {
      actions.apply(action); // timer + session activity state
      switch (action.action) {
        case 'log_set':
          applyLogSet(action);
          break;
        case 'swap_exercise':
          applySwap(action);
          break;
        case 'add_exercise':
          applyAdd(action);
          break;
        case 'modify_plan':
          applyModifyPlan(action);
          break;
        case 'go_to_exercise':
          applyGoTo(action);
          break;
        default:
          break;
      }
    },
    [actions.apply, applyLogSet, applySwap, applyAdd, applyModifyPlan, applyGoTo],
  );

  // When a resumed session belongs to a DIFFERENT workout than the screen was
  // opened with, the header shows the session's real day.
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);

  // Reattached to a live session (screen reopened mid-workout): rebuild the
  // checkmarks and position from the server's logged sets. The server's
  // set_index is the slot, mirroring applyLogSet; unknown exercises come back
  // as extra work. If the session is for another workout day, the exercise
  // list is rebuilt from the session's own snapshot first.
  const applyResume = useCallback(
    (resume: SessionResume) => {
      const redirected = resume.workout ?? null;
      if (!resume.sets.length && !resume.currentExercise && !redirected) return;
      const next: SessionExercise[] = redirected
        ? (redirected.exercises ?? []).map((e, i) => {
            const meta =
              (e.exercise_id ? getExerciseById(e.exercise_id) : undefined) ??
              getExerciseByName(e.exercise_name ?? '');
            return {
              key: e.exercise_id ?? `snap-${i}`,
              name: e.exercise_name ?? meta?.name ?? 'Exercise',
              meta,
              note: e.note,
              sets: (e.target_sets ?? []).map((s, si) => ({
                id: s.id ?? `snap-${i}-${si}`,
                exerciseId: s.exerciseId ?? e.exercise_id ?? '',
                targetReps: s.targetReps ?? 10,
                repsHigh: s.repsHigh,
                weight: s.weight ?? 0,
              })),
            };
          })
        : exercisesRef.current.map((ex) => ({
            ...ex,
            sets: ex.sets.map((s) => ({ ...s })),
          }));
      for (const row of resume.sets) {
        let idx = next.findIndex((ex) => matchesName(ex.name, row.exercise_name));
        if (idx === -1) {
          const meta = getExerciseByName(row.exercise_name);
          next.push({
            key: `extra-${newSetId()}`,
            name: meta?.name ?? row.exercise_name,
            meta,
            addedBySync: true,
            sets: [],
          });
          idx = next.length - 1;
        }
        const ex = next[idx];
        while (ex.sets.length <= row.set_index) {
          const last = ex.sets[ex.sets.length - 1];
          ex.sets.push({
            id: newSetId(),
            exerciseId: last?.exerciseId ?? ex.meta?.id ?? '',
            targetReps: row.reps,
            weight: last?.weight ?? 0,
          });
        }
        ex.sets[row.set_index] = {
          ...ex.sets[row.set_index],
          achievedReps: row.reps,
          weight: row.weight ?? ex.sets[row.set_index].weight,
          completed: true,
        };
      }
      setExercises(next);
      if (redirected) {
        setSessionTitle(redirected.title ?? null);
        setExerciseIdx(0);
      }
      if (resume.currentExercise) {
        const pos = next.findIndex((ex) =>
          matchesName(ex.name, resume.currentExercise as string),
        );
        if (pos >= 0) setExerciseIdx(pos);
      }
      pushToast(
        redirected?.title
          ? `Resumed ${redirected.title} in progress`
          : 'Resumed where you left off',
        'play',
      );
    },
    [pushToast],
  );

  // A different day's workout is mid-session with logged sets: the user
  // decides — resume it (screen switches to that day) or end it and start
  // the day they just opened.
  const resolveConflict = useCallback(
    (info: { title?: string }) =>
      new Promise<'resume' | 'fresh'>((resolve) => {
        Alert.alert(
          'Workout in progress',
          `${info.title ?? 'Another workout'} is still running with logged sets.`,
          [
            {
              text: `Start ${workout.title}`,
              style: 'destructive',
              onPress: () => resolve('fresh'),
            },
            {
              text: `Resume ${info.title ?? 'it'}`,
              onPress: () => resolve('resume'),
            },
          ],
          { cancelable: false },
        );
      }),
    [workout.title],
  );

  // ---- Session + voice ownership -------------------------------------------
  // The workout owns the backend session; the voice socket attaches to it and
  // can drop (mic off) without ending the workout.

  // planId → the backend snapshots the real plan, so the voice coach sees it.
  // workoutId → records which DAY is being trained, so the coach's session
  // context leads with today's exercises instead of guessing.
  const workoutSession = useWorkoutSession({
    getToken,
    planId: plan?.planId ?? null,
    workoutId: workout.id === 'freeform' ? null : workout.id,
    onResume: applyResume,
    resolveConflict,
  });
  const voice = useVoiceSession({
    userId: authUser?.id ?? '',
    getToken,
    onAppAction: handleAppAction,
  });

  const voiceLive = voice.phase !== 'idle' && voice.phase !== 'error';

  // A gentle nudge when the rest countdown runs out on its own (not on skip) —
  // haptic plus, when voice is live, a spoken "rest's over" cue from the coach.
  // (Lives below the useVoiceSession call so it can reach voice.notifyTimerDone.)
  const prevTimerRef = useRef(timer);
  useEffect(() => {
    const prev = prevTimerRef.current;
    prevTimerRef.current = timer;
    if (prev.status === 'running' && timer.status === 'idle' && prev.remaining <= 1) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      voice.notifyTimerDone();
    }
  }, [timer, voice.notifyTimerDone]);

  const enableVoice = useCallback(async () => {
    if (!authUser?.id) return;
    const sid = await workoutSession.start();
    if (sid) await voice.start(sid);
  }, [authUser?.id, workoutSession.start, voice.start]);

  // Hands-free: the coach comes up with the workout — no mic tap needed. One
  // shot per screen visit; failures land in the dock's error row (Retry).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!authUser?.id || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void enableVoice();
  }, [authUser?.id, enableVoice]);

  // Full-row waveform: the user's voice rides the mic feed (live orange), the
  // coach's rides playback samples (accent), thinking gets a synthetic shimmer.
  const shimmer = useMemo(() => makeShimmerSource(), []);
  useEffect(() => () => shimmer.stop(), [shimmer]);
  const listeningLive = voice.phase === 'listening' && !voice.micMuted;
  const waveSource = listeningLive
    ? voice.micWaveform
    : voice.phase === 'coach_speaking'
      ? voicePlayer.waveform
      : voice.phase === 'thinking'
        ? shimmer
        : null;
  const waveColor = listeningLive
    ? colors.live
    : voice.phase === 'coach_speaking' || voice.phase === 'thinking'
      ? colors.accent
      : colors.borderStrong;
  const waveActive =
    listeningLive || voice.phase === 'coach_speaking' || voice.phase === 'thinking';

  // ---- Manual logging (never depends on the socket) -------------------------

  const current = exercises[exerciseIdx];
  const currentSets = current?.sets ?? [];
  const currentSetIdx = currentSets.findIndex((s) => !s.completed);
  const nextExercise = exercises[exerciseIdx + 1];

  const onChangeReps = (setIdx: number, reps: number) => {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === exerciseIdx
          ? {
              ...ex,
              sets: ex.sets.map((s, si) =>
                si === setIdx ? { ...s, achievedReps: reps } : s,
              ),
            }
          : ex,
      ),
    );
  };

  const onChangeWeight = (setIdx: number, weight: number) => {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === exerciseIdx
          ? {
              ...ex,
              sets: ex.sets.map((s, si) => (si === setIdx ? { ...s, weight } : s)),
            }
          : ex,
      ),
    );
  };

  const onToggleComplete = (setIdx: number) => {
    const wasCompleted = currentSets[setIdx]?.completed;
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === exerciseIdx
          ? {
              ...ex,
              sets: ex.sets.map((s, si) => {
                if (si !== setIdx) return s;
                const nowCompleted = !s.completed;
                return {
                  ...s,
                  completed: nowCompleted,
                  achievedReps: s.achievedReps ?? s.targetReps,
                };
              }),
            }
          : ex,
      ),
    );
    if (!wasCompleted) {
      if (weightEditIdx === setIdx) setWeightEditIdx(null);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      actions.startRest(DEFAULT_REST_SECONDS);

      // Persist the set so it counts toward real progress stats (fire-and-
      // forget; un-toggling doesn't delete — last write stands in v1).
      const ex = exercises[exerciseIdx];
      const set = ex?.sets[setIdx];
      const sessionId = workoutSession.sessionId;
      if (ex && set && sessionId) {
        void (async () => {
          try {
            const token = await getToken();
            await logCompletedSet(token, {
              session_id: sessionId,
              exercise_id: ex.meta?.id ?? null,
              exercise_name: ex.name,
              set_index: setIdx,
              reps: set.achievedReps ?? set.targetReps,
              weight: set.weight > 0 ? set.weight : null,
              weight_unit: user.units,
            });
          } catch {
            /* offline — the local session state still has it */
          }
        })();
      }
    }
  };

  const addSet = () => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exerciseIdx) return ex;
        const last = ex.sets[ex.sets.length - 1];
        return {
          ...ex,
          sets: [
            ...ex.sets,
            {
              id: newSetId(),
              exerciseId: last?.exerciseId ?? '',
              targetReps: last?.targetReps ?? 10,
              weight: last?.weight ?? 0,
            },
          ],
        };
      }),
    );
  };

  const goNextExercise = () => {
    if (exerciseIdx < exercises.length - 1) {
      const next = exercises[exerciseIdx + 1];
      setExerciseIdx((i) => i + 1);
      actions.skipRest();
      if (next) workoutSession.setCurrentExercise(next.name);
    } else {
      endWorkout();
    }
  };

  const endWorkout = () => {
    Alert.alert(
      'End workout?',
      'Sync will summarize today and update your history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: async () => {
            await voice.stop();
            await workoutSession.end();
            nav.goBack();
          },
        },
      ],
    );
  };

  // Leaving ≠ finishing: the header X just closes the screen. The session
  // stays active server-side and the next open resumes it (checkmarks,
  // position, coach memory); voice tears down on unmount. Actually finishing
  // the workout goes through the dock's End button / the last exercise.
  const leaveWorkout = () => nav.goBack();

  if (!current) return null;
  const meta = current.meta;
  const voiceError = voice.phase === 'error';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header: end (X) · centered title · rest timer */}
      <View
        style={styles.header}
        onLayout={(e) =>
          setHeaderBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)
        }
      >
        {/* Absolutely centered so uneven side widths can't skew the title. */}
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <AppText variant="h3" align="center" numberOfLines={1}>
            {sessionTitle ?? workout.title}
          </AppText>
        </View>
        <Pressable onPress={leaveWorkout} hitSlop={8} style={styles.closeBtn}>
          <Ionicons name="chevron-down" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerSpacer} />
        {timer.status === 'idle' ? (
          <Pressable
            hitSlop={6}
            style={styles.restChip}
            onPress={() => {
              actions.startRest(DEFAULT_REST_SECONDS);
              setRestExpanded(true);
            }}
          >
            <Ionicons name="timer-outline" size={14} color={colors.accentText} />
            <AppText variant="caption" color="accentText">
              Rest
            </AppText>
          </Pressable>
        ) : (
          <Pressable
            hitSlop={6}
            style={[styles.restChip, styles.restChipLive]}
            onPress={() => setRestExpanded((e) => !e)}
          >
            <RestRing
              remaining={timer.remaining}
              duration={timer.duration}
              paused={timer.status === 'paused'}
              size={22}
              showClock={false}
            />
            <AppText variant="caption" style={styles.tabular}>
              {formatClock(timer.remaining)}
            </AppText>
          </Pressable>
        )}
      </View>


      {/* Per-exercise progress — one segment per exercise, like story dots */}
      <View style={styles.segmentsRow}>
        {exercises.map((ex, i) => {
          const fill =
            i < exerciseIdx
              ? 1
              : i === exerciseIdx && ex.sets.length > 0
                ? ex.sets.filter((s) => s.completed).length / ex.sets.length
                : 0;
          return (
            <View key={ex.key} style={styles.segmentTrack}>
              <View
                style={[
                  styles.segmentFill,
                  {
                    width: `${Math.round(fill * 100)}%`,
                    backgroundColor: i < exerciseIdx ? colors.success : colors.accent,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      {/* Coach changed the plan — surface it, expandable */}
      {planChanges && (
        <Pressable
          style={styles.planBanner}
          onPress={() => setPlanBannerOpen((o) => !o)}
        >
          <View style={styles.planBannerRow}>
            <Ionicons name="sparkles" size={14} color={colors.accentText} />
            <AppText variant="caption" color="accentText" style={{ flex: 1 }}>
              Sync updated today's plan
            </AppText>
            <AppText variant="caption" color="accentText">
              {planBannerOpen ? 'Hide' : 'View'}
            </AppText>
          </View>
          {planBannerOpen && (
            <View style={styles.planChanges}>
              {planChanges.map((c, i) => (
                <AppText key={i} variant="caption">
                  • {c.op}
                  {c.exercise_name ? ` ${c.exercise_name}` : ''}
                  {c.to_exercise ? ` → ${c.to_exercise}` : ''}
                  {c.sets != null ? ` · ${c.sets} sets` : ''}
                  {c.reps != null ? ` · ${c.reps} reps` : ''}
                  {c.note ? ` — ${c.note}` : ''}
                </AppText>
              ))}
            </View>
          )}
        </Pressable>
      )}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Exercise hero — the movement, full bleed, name over the photo */}
        <Card variant="floating" radius="xl" padded={false} style={styles.heroCard}>
          <View>
            <ExerciseImage
              exerciseId={meta?.id ?? ''}
              muscle={meta?.muscleGroup ?? 'Full Body'}
              aspectRatio={16 / 10}
              radius={0}
              style={styles.heroImage}
            />
            <LinearGradient
              colors={['transparent', 'rgba(11,36,71,0.72)']}
              style={styles.heroScrim}
            />
            {current.addedBySync && (
              <View style={styles.heroBadgeLeft}>
                <Chip label="Added by Sync" size="sm" tone="onAccent" />
              </View>
            )}
            {/* Position in the workout, on the photo */}
            <View style={styles.countPill}>
              <AppText variant="caption" color="textInverse" style={styles.tabular}>
                {exerciseIdx + 1} / {exercises.length}
              </AppText>
            </View>
            <View style={styles.heroText}>
              <AppText variant="h2" color="textInverse" numberOfLines={2}>
                {current.name}
              </AppText>
              {meta && (
                <AppText variant="caption" color="rgba(255,255,255,0.75)">
                  {meta.equipment} · {meta.muscleGroup}
                </AppText>
              )}
            </View>
          </View>
        </Card>

        {/* Sets */}
        <View style={styles.setsBlock}>
          {currentSets.map((s, i) => (
            <SetRow
              key={s.id}
              index={i}
              targetReps={s.targetReps}
              weight={s.weight}
              achievedReps={s.achievedReps}
              completed={s.completed}
              isCurrent={i === currentSetIdx}
              units={user.units}
              weightExpanded={weightEditIdx === i && !s.completed}
              onPressWeight={
                s.completed
                  ? undefined
                  : () => setWeightEditIdx((cur) => (cur === i ? null : i))
              }
              onChangeWeight={(w) => onChangeWeight(i, w)}
              onChangeReps={(reps) => onChangeReps(i, reps)}
              onToggleComplete={() => onToggleComplete(i)}
            />
          ))}
          <Pressable onPress={addSet} style={styles.addSetRow}>
            <Ionicons name="add" size={16} color={colors.accentText} />
            <AppText variant="caption" color="accentText">
              Add set
            </AppText>
          </Pressable>
        </View>

        {/* Up next — keeps momentum */}
        <View style={styles.upNext}>
          {nextExercise ? (
            <>
              <AppText variant="label">Up next</AppText>
              <View style={styles.upNextRow}>
                <ExerciseImage
                  exerciseId={nextExercise.meta?.id ?? ''}
                  muscle={nextExercise.meta?.muscleGroup ?? 'Full Body'}
                  size={40}
                  radius="sm"
                />
                <AppText variant="bodyMedium" numberOfLines={1} style={{ flex: 1 }}>
                  {nextExercise.name}
                </AppText>
              </View>
            </>
          ) : (
            <AppText variant="caption" align="center">
              Last exercise — finish strong 💪
            </AppText>
          )}
        </View>

        <Button
          title={
            exerciseIdx < exercises.length - 1 ? 'Next exercise' : 'Finish workout'
          }
          icon={exerciseIdx < exercises.length - 1 ? 'arrow-forward' : 'checkmark'}
          onPress={goNextExercise}
          style={styles.nextBtn}
        />
      </ScrollView>

      {/* Coach dock */}
      <View style={styles.dock}>
        {voiceError ? (
          <View style={styles.dockErrorRow}>
            <Ionicons name="warning-outline" size={16} color={colors.dangerText} />
            <AppText variant="caption" color="dangerText" style={{ flex: 1 }} numberOfLines={2}>
              {voice.error ?? "Couldn't reach your coach"}
            </AppText>
            <Button
              title="Retry"
              variant="secondary"
              size="sm"
              full={false}
              onPress={() => void enableVoice()}
            />
          </View>
        ) : voiceLive ? (
          <View style={styles.dockLiveCol}>
            {/* The whole row is the coach's presence — voice-first, no transcript
                (the screen is usually pocketed while this is in use). */}
            <VoiceWaveform
              source={waveSource}
              color={waveColor}
              active={waveActive}
              height={44}
            />
            <View style={styles.dockControlsRow}>
              <Pressable onPress={endWorkout} hitSlop={8} style={styles.dockEndBtn}>
                <Ionicons name="stop-circle-outline" size={22} color={colors.textSecondary} />
              </Pressable>
              <AppText
                variant="bodyMedium"
                color={listeningLive ? 'liveText' : 'textSecondary'}
                style={styles.dockPhaseLabel}
              >
                {voice.micMuted ? 'Muted' : PHASE_LABEL[voice.phase]}
              </AppText>
              <VoiceButton
                size={52}
                active={listeningLive}
                onPress={() => voice.setMicMuted(!voice.micMuted)}
              />
            </View>
          </View>
        ) : (
          <View style={styles.dockIdleRow}>
            <Button
              title="End workout"
              variant="secondary"
              icon="stop-circle-outline"
              full={false}
              onPress={endWorkout}
              style={{ flex: 1 }}
            />
            <VoiceButton size={52} onPress={() => void enableVoice()} />
          </View>
        )}
      </View>

      {/* Rest controls — a popover just below the header chip; overlays
          content, never shifts the layout. Tapping anywhere else closes it. */}
      {restExpanded && timer.status !== 'idle' && (
        <Pressable
          style={styles.restScrim}
          onPress={() => setRestExpanded(false)}
        />
      )}
      {restExpanded && timer.status !== 'idle' && (
        <Animated.View
          entering={FadeInDown.duration(180)}
          exiting={FadeOutUp.duration(150)}
          style={[styles.restPopover, { top: headerBottom + spacing.xs }]}
        >
          <Button
            title="+30s"
            variant="ghost"
            size="sm"
            full={false}
            onPress={() => actions.extendRest(30)}
          />
          <Button
            title={timer.status === 'paused' ? 'Resume' : 'Pause'}
            variant="ghost"
            size="sm"
            full={false}
            onPress={actions.toggleRestPause}
          />
          <Button
            title="Skip"
            variant="ghost"
            size="sm"
            full={false}
            onPress={() => {
              actions.skipRest();
              setRestExpanded(false);
            }}
          />
        </Animated.View>
      )}

      <SessionToasts
        toasts={toasts}
        onDismiss={dismissToast}
        topOffset={headerBottom > 0 ? headerBottom + spacing.sm : undefined}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.bg },
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: t.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  headerTitleWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 64,
  },
  headerSpacer: { flex: 1 },
  restChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: t.colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderWidth: 1,
    borderColor: t.colors.border,
    minHeight: 30,
  },
  restChipLive: {
    backgroundColor: t.colors.accentFaint,
    borderColor: t.colors.accentSoft,
  },
  restScrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 29,
  },
  restPopover: {
    position: 'absolute',
    right: layout.SCREEN_H_PADDING,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: t.colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    ...t.shadows.lg,
  },
  segmentsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingBottom: spacing.sm,
  },
  segmentTrack: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: t.colors.sunken,
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  planBanner: {
    marginHorizontal: layout.SCREEN_H_PADDING,
    marginBottom: spacing.sm,
    backgroundColor: t.colors.accentFaint,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  planBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  planChanges: { gap: spacing.xs, paddingLeft: spacing.xl - 2 },
  scrollContent: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingBottom: 140,
    paddingTop: spacing.xs,
  },
  heroCard: { overflow: 'hidden' },
  heroImage: { borderWidth: 0, borderRadius: 0 },
  heroScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  heroBadgeLeft: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
  },
  countPill: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(11,36,71,0.45)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroText: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.md,
    gap: 2,
  },
  setsBlock: { marginTop: spacing.lg },
  addSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderStyle: 'dashed',
  },
  upNext: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  upNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: t.colors.card,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    ...t.shadows.xs,
  },
  nextBtn: { marginTop: spacing.lg },
  dock: {
    backgroundColor: t.colors.card,
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingVertical: spacing.md,
    ...t.shadows.lg,
    shadowOffset: { width: 0, height: -8 },
  },
  dockIdleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dockLiveCol: {
    gap: spacing.sm,
  },
  dockControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dockEndBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockPhaseLabel: { flex: 1, textAlign: 'center' },
  dockErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
}));

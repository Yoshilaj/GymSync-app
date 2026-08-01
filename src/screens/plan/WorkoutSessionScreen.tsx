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
import { AppText, Button, Card, Chip, Skeleton } from '@/components/ui';
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
import { useUpgradePrompt } from '@/billing/useUpgradePrompt';
import { useBilling } from '@/billing/BillingProvider';
import { isUpgradeError, type UpgradeRequired } from '@/billing/upgrade';
import { addSessionNote, type SessionNote } from '@/api/session';
import { SessionNoteSheet } from './SessionNoteSheet';
import { kgToLbs } from '@/lib/units';

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

/**
 * Gate: the session below seeds its exercise list from the plan exactly ONCE,
 * at mount (see the lazy initializer). If it mounts before the plan arrives it
 * seeds from the empty free-form shell and never recovers — the user trains a
 * real workout in an "Open workout" with no exercises for the whole session.
 *
 * So the gate has to be a wrapper, not an early return: the session's hooks
 * (start(), the voice session, the auto-start effect) must not run against a
 * plan that isn't there yet.
 *
 * Free-form is still a legitimate destination — arriving with no workoutId, or
 * with no plan at all. Only wait when a specific workout was asked for and the
 * plan simply hasn't landed to resolve it.
 */
export function WorkoutSessionScreen() {
  const { status: planStatus } = usePlan();

  // Only 'loading' waits. 'empty' and 'error' are answers — they resolve to a
  // free-form session, which is a real destination, not a fallback.
  if (planStatus === 'loading') return <WorkoutSessionSkeleton />;

  return <WorkoutSessionActive />;
}

/** The session's shape while the plan resolves: header chrome, hero, set rows. */
function WorkoutSessionSkeleton() {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Skeleton width={140} height={19} />
        </View>
        <View style={styles.closeBtn} />
        <View style={styles.headerSpacer} />
        <Skeleton width={64} height={28} round />
      </View>
      <View style={styles.scrollContent}>
        <Skeleton height={180} style={{ borderRadius: radius.lg }} />
        <View style={styles.sessionSkeletonRows}>
          <Skeleton width="46%" height={18} />
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function WorkoutSessionActive() {
  const { colors } = useTheme();
  const styles = useStyles();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteP>();
  const { user } = useUser();

  /**
   * Server weights are kilograms, always (migration 017). Everything on this
   * screen is shown in the unit the user picked, so convert once, here.
   *
   * Before this, the raw stored number was rendered as-is: a set logged by
   * voice as "75 kg" appeared as "75" next to a lbs label.
   */
  const toDisplayWeight = useCallback(
    (kg: number | null | undefined): number =>
      kg == null ? 0 : user.units === 'kg' ? Math.round(kg * 10) / 10 : kgToLbs(kg),
    [user.units],
  );
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
  const [noteOpen, setNoteOpen] = useState(false);
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
                  weight: toDisplayWeight(action.weight),
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
                  weight: action.weight != null ? toDisplayWeight(action.weight) : (last?.weight ?? 0),
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
                    weight: action.weight != null ? toDisplayWeight(action.weight) : s.weight,
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
          ? `${action.reps} × ${toDisplayWeight(action.weight)}`
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
        case 'injury_recorded':
          // The spoken path's only visible confirmation — the coach is forbidden
          // from reading the internal action note aloud.
          pushToast(
            action.body_part
              ? `Noted — I'll program around your ${action.body_part.toLowerCase()}`
              : 'Injury noted',
            'medkit',
          );
          break;
        default:
          break;
      }
    },
    [
      actions.apply,
      applyLogSet,
      applySwap,
      applyAdd,
      applyModifyPlan,
      applyGoTo,
      pushToast,
    ],
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
                weight: toDisplayWeight(s.weight),
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
  const promptUpgrade = useUpgradePrompt();
  const { entitlement, status: billingStatus } = useBilling();

  // Live coaching is Pro: the backend allows Free 0 voice sessions a month
  // (entitlements.py, VOICE_SESSION). Knowing that here is what keeps a Free
  // user out of a session the server will refuse — the workout itself stays
  // open to everyone, because Free includes Workout Logging.
  //
  // Only a CONFIRMED Free tier pre-empts. 'loading' isn't an answer yet, and
  // 'error' means the entitlement READ failed and the Free it reports is a
  // display fallback — denying voice on that would cost a paying customer
  // their coach over a network blip. The server is the authority either way,
  // and its refusal now lands in the dock instead of a dead mic.
  const voiceDenied = billingStatus === 'ready' && entitlement.tier === 'free';
  const voiceEntitled = billingStatus !== 'loading' && !voiceDenied;

  // A refusal that arrives from the server anyway — a Pro customer who has
  // spent this month's allowance. Held here (rather than jumping straight to
  // the paywall) because this screen is a fullScreenModal: navigating to
  // Pricing while it is up opens the paywall UNDERNEATH it, which is why the
  // upgrade prompt used to appear only after the session was closed.
  const [voiceRefusal, setVoiceRefusal] = useState<UpgradeRequired | null>(null);

  const voice = useVoiceSession({
    userId: authUser?.id ?? '',
    getToken,
    onAppAction: handleAppAction,
    onUpgradeRequired: setVoiceRefusal,
  });

  const voiceLive = voice.phase !== 'idle' && voice.phase !== 'error';
  // Voice can't run: either we know the tier is too low, or the server said so.
  // Either way the dock sells instead of pretending to listen. Note this is
  // NOT `!voiceEntitled` — an unanswered billing read must not flash "Pro
  // feature" at a subscriber while the entitlement is still in the air.
  const voiceLocked = voiceDenied || voiceRefusal !== null;

  // Dismiss the session first, then open Pricing — see voiceRefusal above.
  // Leaving is free: the workout stays active server-side and resumes on the
  // next open (same as the header chevron).
  const openVoicePaywall = useCallback(() => {
    nav.goBack();
    promptUpgrade(voiceRefusal?.requiredTier ?? 'pro');
  }, [nav, promptUpgrade, voiceRefusal]);

  // Reporting pain by tapping. Premium, like report_injury — so a customer below it
  // meets the paywall on the tap rather than after filling the form in. The submit
  // path still handles a refusal, because the server is the authority on tier and this
  // check is only here to save the wasted typing.
  const isPremium = entitlement.tier === 'premium';
  const openNote = useCallback(() => {
    if (!isPremium) {
      promptUpgrade('premium');
      return;
    }
    setNoteOpen(true);
  }, [isPremium, promptUpgrade]);

  const submitNote = useCallback(
    async (note: SessionNote) => {
      // A note needs a session to hang off, and one may not exist yet: nothing starts
      // a session until voice is enabled. start() returns the existing id when there
      // is one, so this is safe to call on every note.
      const sessionId = await workoutSession.start();
      if (!sessionId) throw new Error('Could not start a session for this note.');
      try {
        await addSessionNote(await getToken(), sessionId, note);
      } catch (e) {
        if (isUpgradeError(e)) {
          setNoteOpen(false);
          promptUpgrade(e.upgrade);
          return;
        }
        throw e;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      pushToast(
        note.kind === 'injury'
          ? `Noted — I'll program around your ${(note.bodyPart ?? 'injury').toLowerCase()}`
          : 'Noted',
        note.kind === 'injury' ? 'medkit' : 'create',
      );
    },
    [workoutSession.start, getToken, promptUpgrade, pushToast],
  );

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
    // Never open a mic the server won't listen to.
    if (voiceLocked) {
      openVoicePaywall();
      return;
    }
    // Billing hasn't answered yet — the auto-start effect fires when it does.
    if (!voiceEntitled) return;
    const sid = await workoutSession.start();
    if (sid) await voice.start(sid);
  }, [
    authUser?.id,
    voiceLocked,
    voiceEntitled,
    openVoicePaywall,
    workoutSession.start,
    voice.start,
  ]);

  // Hands-free: the coach comes up with the workout — no mic tap needed. One
  // shot per screen visit; failures land in the dock's error row (Retry).
  // Waits for the entitlement: on Free this never fires, and the dock offers
  // the upgrade instead of listening to a session that was refused.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!authUser?.id || autoStartedRef.current) return;
    if (!voiceEntitled) return;
    autoStartedRef.current = true;
    void enableVoice();
  }, [authUser?.id, enableVoice, voiceEntitled]);

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

  // A blank screen is never the right answer — show the session's shape while
  // there's no current exercise to render (the voice coach can still be
  // starting one up).
  if (!current) return <WorkoutSessionSkeleton />;
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
        {/* Tell the coach something without talking to it. Sits beside the rest
            chip because both are things you reach for between sets. */}
        <Pressable
          onPress={openNote}
          hitSlop={8}
          style={styles.noteBtn}
          accessibilityRole="button"
          accessibilityLabel="Report an injury or leave a note"
        >
          <Ionicons name="medkit-outline" size={18} color={colors.textSecondary} />
        </Pressable>
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
        {/* Non-fatal notices (a lost turn, a coach that didn't answer) used to
            be set and never rendered — which is how a stalled session looked
            identical to a healthy one. */}
        {voice.notice && !voiceLocked && (
          <View style={styles.dockNoticeRow}>
            <Ionicons
              name="information-circle-outline"
              size={15}
              color={colors.textSecondary}
            />
            <AppText variant="caption" color="textSecondary" numberOfLines={2} style={{ flex: 1 }}>
              {voice.notice}
            </AppText>
          </View>
        )}
        {voiceLocked ? (
          <View style={styles.dockLiveCol}>
            <View style={styles.dockLockedRow}>
              <Ionicons name="mic-off-outline" size={16} color={colors.textSecondary} />
              <AppText variant="caption" color="textSecondary" style={{ flex: 1 }} numberOfLines={2}>
                {voiceRefusal?.message ?? 'Live voice coaching is a Pro feature.'}
              </AppText>
              <Button
                title="Upgrade"
                variant="secondary"
                size="sm"
                full={false}
                onPress={openVoicePaywall}
              />
            </View>
            <Button
              title="End workout"
              variant="secondary"
              icon="stop-circle-outline"
              onPress={endWorkout}
            />
          </View>
        ) : voiceError ? (
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

      <SessionNoteSheet
        visible={noteOpen}
        onClose={() => setNoteOpen(false)}
        onSubmit={submitNote}
      />

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
  // Same geometry as closeBtn — the two flank the title and must read as a pair.
  noteBtn: {
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
  sessionSkeletonRows: { gap: spacing.sm, marginTop: spacing.xl },
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
  dockLockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dockNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
}));

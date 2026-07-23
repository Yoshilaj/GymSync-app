import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout, radius, shadows, spacing } from '@/theme';
import { AppText, Button, Card, Chip } from '@/components/ui';
import { SetRow } from '@/components/SetRow';
import { VoiceButton } from '@/components/VoiceButton';
import { CoachOrb } from '@/components/CoachOrb';
import { ExerciseImage } from '@/components/ExerciseImage';
import { RestRing } from '@/components/RestRing';
import { SessionToasts, SessionToast } from '@/components/SessionToasts';
import { getTodaysWorkout, getWorkoutById } from '@/data/mockPlan';
import { getExerciseById, getExerciseByName } from '@/data/mockExercises';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/auth/AuthContext';
import {
  useVoiceSession,
  useWorkoutSession,
  useSessionActions,
  formatClock,
  type AppActionMessage,
  type PlanChange,
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
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteP>();
  const { user } = useUser();
  const { user: authUser, getToken } = useAuth();

  const workout = useMemo(
    () => getWorkoutById(route.params?.workoutId) ?? getTodaysWorkout(),
    [route.params?.workoutId],
  );

  const [exercises, setExercises] = useState<SessionExercise[]>(() =>
    workout.exercises.map((pe) => {
      const meta = getExerciseById(pe.exerciseId);
      return {
        key: pe.exerciseId,
        name: meta?.name ?? pe.exerciseId,
        meta,
        sets: pe.sets.map((s) => ({ ...s })),
        note: pe.note,
      };
    }),
  );
  const [exerciseIdx, setExerciseIdx] = useState(0);
  const exerciseIdxRef = useRef(0);
  exerciseIdxRef.current = exerciseIdx;

  const [toasts, setToasts] = useState<SessionToast[]>([]);
  const [planChanges, setPlanChanges] = useState<PlanChange[] | null>(null);
  const [planBannerOpen, setPlanBannerOpen] = useState(false);
  const [restExpanded, setRestExpanded] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const actions = useSessionActions();
  const { timer } = actions.state;

  // Elapsed session clock.
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

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
          const firstOpen = ex.sets.findIndex((s) => !s.completed);
          if (firstOpen === -1) {
            // All planned sets done — the coach logged a bonus set.
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
              si === firstOpen
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
      actions.startRest(DEFAULT_REST_SECONDS);
      pushToast(
        action.weight != null
          ? `${action.exercise} — ${action.reps} × ${action.weight}`
          : `${action.exercise} — ${action.reps} reps`,
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
      // Only exercises the user hasn't reached yet are fair game to mutate.
      setExercises((prev) => {
        const startAt = exerciseIdxRef.current + 1;
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
            next = next.filter(
              (ex, i) => i < startAt || !matchesName(ex.name, change.exercise_name!),
            );
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
        default:
          break;
      }
    },
    [actions.apply, applyLogSet, applySwap, applyAdd, applyModifyPlan],
  );

  // ---- Session + voice ownership -------------------------------------------
  // The workout owns the backend session; the voice socket attaches to it and
  // can drop (mic off) without ending the workout.

  const workoutSession = useWorkoutSession({ getToken });
  const voice = useVoiceSession({
    userId: authUser?.id ?? '',
    getToken,
    onTranscript: setTranscript,
    onAppAction: handleAppAction,
  });

  const voiceLive = voice.phase !== 'idle' && voice.phase !== 'error';

  const enableVoice = useCallback(async () => {
    if (!authUser?.id) return;
    const sid = await workoutSession.start();
    if (sid) await voice.start(sid);
  }, [authUser?.id, workoutSession.start, voice.start]);

  const disableVoice = useCallback(() => {
    void voice.stop(); // socket only — the workout session survives
  }, [voice.stop]);

  const toggleVoice = useCallback(() => {
    if (voiceLive) disableVoice();
    else void enableVoice();
  }, [voiceLive, enableVoice, disableVoice]);

  // ---- Manual logging (never depends on the socket) -------------------------

  const current = exercises[exerciseIdx];
  const currentSets = current?.sets ?? [];
  const completedCount = currentSets.filter((s) => s.completed).length;
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
    if (!wasCompleted) actions.startRest(DEFAULT_REST_SECONDS);
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

  if (!current) return null;
  const meta = current.meta;
  const cue =
    meta && meta.cues.length > 0
      ? meta.cues[completedCount % meta.cues.length]
      : undefined;
  const voiceError = voice.phase === 'error';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header: end (X) · title + position · elapsed */}
      <View style={styles.header}>
        <Pressable onPress={endWorkout} hitSlop={8} style={styles.closeBtn}>
          <Ionicons name="close" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <AppText variant="h3" align="center" numberOfLines={1}>
            {workout.title}
          </AppText>
          <AppText variant="caption" align="center">
            Exercise {exerciseIdx + 1} of {exercises.length}
          </AppText>
        </View>
        <View style={styles.elapsedChip}>
          <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
          <AppText variant="caption" style={styles.tabular}>
            {formatClock(elapsed)}
          </AppText>
        </View>
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
              <View style={styles.heroBadge}>
                <Chip label="Added by Sync" size="sm" tone="onAccent" />
              </View>
            )}
            <View style={styles.heroText}>
              <AppText variant="label" color="rgba(255,255,255,0.8)">
                Now lifting
              </AppText>
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
          {(cue || current.note) && (
            <View style={styles.cueStrip}>
              <Ionicons name="bulb-outline" size={15} color={colors.warningText} />
              <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
                {cue ?? current.note}
              </AppText>
            </View>
          )}
        </Card>

        {/* Sets */}
        <AppText variant="label" style={styles.setsHeading}>
          Sets
        </AppText>
        <View>
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

      {/* Floating rest card */}
      {timer.status !== 'idle' && (
        <Animated.View
          entering={SlideInDown.duration(250)}
          exiting={SlideOutDown.duration(200)}
          style={styles.restWrap}
          pointerEvents="box-none"
        >
          <Pressable
            style={styles.restCard}
            onPress={() => setRestExpanded((e) => !e)}
          >
            <View style={styles.restMain}>
              <RestRing
                remaining={timer.remaining}
                duration={timer.duration}
                paused={timer.status === 'paused'}
                size={56}
              />
              <View style={styles.restTextCol}>
                <AppText variant="label">Rest</AppText>
                <AppText variant="caption" color="textTertiary">
                  {timer.status === 'paused' ? 'Paused' : 'Tap for options'}
                </AppText>
              </View>
            </View>
            {restExpanded && (
              <View style={styles.restControls}>
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
              </View>
            )}
          </Pressable>
        </Animated.View>
      )}

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
          <View style={styles.dockLiveRow}>
            <Pressable onPress={endWorkout} hitSlop={8} style={styles.dockEndBtn}>
              <Ionicons name="stop-circle-outline" size={22} color={colors.textSecondary} />
            </Pressable>
            <CoachOrb phase={voice.phase} size={44} />
            <View style={styles.dockStatus}>
              <AppText
                variant="bodyMedium"
                color={voice.phase === 'listening' ? 'liveText' : 'textPrimary'}
              >
                {PHASE_LABEL[voice.phase]}
              </AppText>
              {!!transcript && (
                <AppText variant="caption" numberOfLines={1}>
                  You: {transcript}
                </AppText>
              )}
            </View>
            <VoiceButton size={52} active={voice.phase === 'listening'} onPress={toggleVoice} />
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
            <VoiceButton size={52} onPress={toggleVoice} />
          </View>
        )}
      </View>

      <SessionToasts toasts={toasts} onDismiss={dismissToast} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
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
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerCenter: { flex: 1, gap: 1 },
  elapsedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.sunken,
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  planBanner: {
    marginHorizontal: layout.SCREEN_H_PADDING,
    marginBottom: spacing.sm,
    backgroundColor: colors.accentFaint,
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
  heroBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  heroText: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.md,
    gap: 2,
  },
  cueStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
  },
  setsHeading: { marginTop: spacing.lg, marginBottom: spacing.sm },
  addSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    ...shadows.xs,
  },
  nextBtn: { marginTop: spacing.lg },
  restWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    alignItems: 'center',
  },
  restCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    ...shadows.md,
  },
  restMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  restTextCol: { gap: 2 },
  restControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dock: {
    backgroundColor: colors.card,
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingVertical: spacing.md,
    ...shadows.lg,
    shadowOffset: { width: 0, height: -8 },
  },
  dockIdleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dockLiveRow: {
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
  dockStatus: { flex: 1, gap: 2 },
  dockErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});

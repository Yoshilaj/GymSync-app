/**
 * The last mile of onboarding: the profile is saved, and this screen builds
 * the first plan in place — no chat hand-off. Recovers a still-pending
 * proposal after a crash/reload, otherwise fires one-shot generation, then
 * shows the PlanCard with "Start training". Accept (or "Skip for now" on
 * error) calls completeOnboarding(), which flips the gate into the app.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { makeStyles, spacing } from '@/theme';
import { AppText, Button, Card, Chip, Screen, Skeleton } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { usePlan } from '@/context/PlanContext';
import {
  acceptPlanProposal,
  fetchLatestProposal,
  generatePlan,
} from '@/api/plan';
import type { PlanProposalWire } from '@/voice';
import type { ProposalStatus } from '@/voice/useTextChat';
import { PlanCard } from '@/screens/sync/components/PlanCard';
import { useOnboarding } from './OnboardingContext';
import { GOALS } from './options';

/** Dev replay only — lets the reveal be reviewed without burning a generation. */
const PREVIEW_PLAN: PlanProposalWire = {
  name: 'Upper / Lower Split',
  split_type: 'upper_lower',
  rationale: 'Four focused days built around your equipment and time.',
  days: [
    {
      day_label: 'Mon',
      title: 'Upper — Push',
      est_minutes: 60,
      exercises: [
        { exercise_name: 'Barbell Bench Press', sets: 4, reps_low: 6, reps_high: 8 },
        { exercise_name: 'Overhead Press', sets: 3, reps_low: 8, reps_high: 10 },
        { exercise_name: 'Cable Fly', sets: 3, reps_low: 12, reps_high: 15 },
      ],
    },
    {
      day_label: 'Tue',
      title: 'Lower — Squat',
      est_minutes: 60,
      exercises: [
        { exercise_name: 'Back Squat', sets: 4, reps_low: 5, reps_high: 6 },
        { exercise_name: 'Romanian Deadlift', sets: 3, reps_low: 8, reps_high: 10 },
      ],
    },
    {
      day_label: 'Thu',
      title: 'Upper — Pull',
      est_minutes: 60,
      exercises: [
        { exercise_name: 'Pull-up', sets: 4, reps_low: 6, reps_high: 10 },
        { exercise_name: 'Barbell Row', sets: 3, reps_low: 8, reps_high: 10 },
      ],
    },
    {
      day_label: 'Fri',
      title: 'Lower — Hinge',
      est_minutes: 60,
      exercises: [
        { exercise_name: 'Deadlift', sets: 3, reps_low: 4, reps_high: 5 },
        { exercise_name: 'Walking Lunge', sets: 3, reps_low: 10, reps_high: 12 },
      ],
    },
  ],
};

const CAPTIONS = [
  'Reading your goals and schedule…',
  'Balancing muscle groups across the week…',
  'Picking exercises for your equipment…',
  'Setting reps and sets to your level…',
  'Almost there — final checks…',
];

type Phase = 'generating' | 'ready' | 'error';

function GhostCard() {
  const styles = useStyles();
  return (
    <Card style={styles.ghost}>
      <Skeleton width={96} height={10} />
      <Skeleton width="70%" height={22} style={styles.ghostGap} />
      <Skeleton width={120} height={12} style={styles.ghostGapSm} />
      <View style={styles.ghostRows}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </View>
    </Card>
  );
}

export function BuildingPlanScreen() {
  const styles = useStyles();
  const { getToken } = useAuth();
  const { refresh } = usePlan();
  const { completeOnboarding, submitting, draft, preview } = useOnboarding();
  const reduceMotion = useReducedMotion();

  // Echo what they actually chose while the plan builds — a progress bar that
  // says nothing reads as a stall; their own answers read as work being done.
  const goalLabel = GOALS.find((g) => g.value === draft.goals[0])?.label;
  const summary = [
    goalLabel,
    draft.trainingDays ? `${draft.trainingDays} days` : null,
    draft.sessionMinutes ? `${draft.sessionMinutes} min` : null,
  ].filter((s): s is string => !!s);

  const [phase, setPhase] = useState<Phase>('generating');
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanProposalWire | null>(null);
  const [status, setStatus] = useState<ProposalStatus>('pending');
  const [captionIdx, setCaptionIdx] = useState(0);
  const startedRef = useRef(false);

  // Cycle the wait captions while generating.
  useEffect(() => {
    if (phase !== 'generating' || reduceMotion) return;
    const timer = setInterval(
      () => setCaptionIdx((i) => (i + 1) % CAPTIONS.length),
      2400,
    );
    return () => clearInterval(timer);
  }, [phase, reduceMotion]);

  const generate = useCallback(
    async (recoverFirst: boolean) => {
      setPhase('generating');
      setStatus('pending');
      if (preview) {
        setTimeout(() => {
          setProposalId('preview');
          setPlan(PREVIEW_PLAN);
          setPhase('ready');
        }, 1800);
        return;
      }
      try {
        const token = await getToken();
        if (!token) throw new Error('Not signed in.');
        if (recoverFirst) {
          const existing = await fetchLatestProposal(token);
          if (existing) {
            setProposalId(existing.id);
            setPlan(existing.payload);
            setPhase('ready');
            return;
          }
        }
        const result = await generatePlan(token);
        setProposalId(result.proposal_id);
        setPlan(result.plan);
        setPhase('ready');
      } catch {
        setPhase('error');
      }
    },
    [getToken, preview],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void generate(true);
  }, [generate]);

  // The payoff beat — the one place in onboarding that earns a success haptic.
  useEffect(() => {
    if (phase === 'ready') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [phase]);

  const handleAccept = async () => {
    if (!proposalId) return;
    if (preview) {
      setStatus('accepted');
      return;
    }
    setStatus('accepting');
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in.');
      await acceptPlanProposal(token, proposalId);
      await refresh();
      setStatus('accepted');
      await completeOnboarding();
    } catch {
      setStatus('failed');
    }
  };

  const caption = reduceMotion ? CAPTIONS[0] : CAPTIONS[captionIdx];

  return (
    <Screen scroll tabBarClearance={false}>
      <View style={styles.top}>
        <AppText variant="display">
          {phase === 'ready' ? 'Your first plan is ready.' : 'Building your plan'}
        </AppText>

        {summary.length > 0 && phase !== 'error' && (
          <View style={styles.summary}>
            {summary.map((s) => (
              <Chip key={s} label={s} tone="accent" size="sm" />
            ))}
          </View>
        )}

        {phase === 'generating' && (
          <Animated.View
            key={caption}
            entering={reduceMotion ? undefined : FadeIn.duration(300)}
            exiting={reduceMotion ? undefined : FadeOut.duration(300)}
          >
            <AppText variant="body" color="textSecondary" style={styles.caption}>
              {caption}
            </AppText>
          </Animated.View>
        )}
        {phase === 'ready' && (
          <AppText variant="body" color="textSecondary" style={styles.caption}>
            Built from everything you just told us. Accept it to start — you
            can always ask your coach to change it later.
          </AppText>
        )}
      </View>

      {phase === 'generating' && <GhostCard />}

      {phase === 'ready' && plan && (
        <PlanCard
          plan={plan}
          status={status}
          onAccept={() => void handleAccept()}
          onRequestChanges={() => void generate(false)}
          onViewPlan={() => void completeOnboarding()}
          acceptLabel="Start training"
          secondaryLabel="Regenerate"
        />
      )}

      {phase === 'error' && (
        <View style={styles.errorBox}>
          <AppText variant="h3">That didn't work</AppText>
          <AppText variant="body" color="textSecondary" style={styles.errorBody}>
            We couldn't build your plan just now. You can try again, or skip
            ahead and ask your coach for a plan anytime.
          </AppText>
          <Button title="Try again" variant="primary" onPress={() => void generate(false)} />
          <Button
            title="Skip for now"
            variant="ghost"
            loading={submitting}
            onPress={() => void completeOnboarding()}
          />
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    top: {
      marginTop: spacing.xxl,
      marginBottom: spacing.xl,
      gap: spacing.sm,
    },
    summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    caption: { minHeight: 44 },
    ghost: { gap: 0 },
    ghostGap: { marginTop: spacing.md },
    ghostGapSm: { marginTop: spacing.sm },
    ghostRows: { marginTop: spacing.lg, gap: spacing.sm },
    errorBox: { gap: spacing.md, marginTop: spacing.lg },
    errorBody: { marginBottom: spacing.sm },
  }),
);

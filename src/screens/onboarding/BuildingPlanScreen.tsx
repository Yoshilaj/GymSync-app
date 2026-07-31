/**
 * The last mile of onboarding: the profile is saved, and this screen builds
 * the first plan in place — no chat hand-off. Recovers a still-pending
 * proposal after a crash/reload, otherwise fires one-shot generation, then
 * shows the PlanCard with "Start training". Accept (or "Skip for now" on
 * error) calls completeOnboarding(), which flips the gate into the app.
 *
 * When the answers came from the pre-auth flow (`needsSubmit`), the profile
 * ISN'T saved yet — generate() PUTs the stashed draft first, inside the same
 * retry path, so a failed submit and a failed generation share one Try-again.
 * The stash itself is only cleared when onboarded_at lands (UserContext), so
 * any crash in here resumes on relaunch instead of re-asking 18 questions.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import {
  AppText,
  Button,
  Card,
  Chip,
  Entering,
  Screen,
  Skeleton,
} from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { usePlan } from '@/context/PlanContext';
import {
  acceptPlanProposal,
  adoptPlanProposal,
  fetchLatestProposal,
  generatePlan,
} from '@/api/plan';
import type { PlanProposalWire } from '@/voice';
import type { ProposalStatus } from '@/voice/useTextChat';
import { PlanCard } from '@/screens/sync/components/PlanCard';
import { updatePersonality } from '@/api/personality';
import { useOnboarding } from './OnboardingContext';
import { matchCoach } from './coachMatch';
import { GOALS } from './options';
import { isUpgradeError } from '@/billing/upgrade';

/** Loose, like PricingRoutes' — the onboarding stack has no exported param list. */
type OnboardingNav = NativeStackNavigationProp<Record<string, object | undefined>>;

/** Dev replay only — lets the reveal be reviewed without burning a generation.
 *  (Exported for PreparingScreen's preview path.) */
export const PREVIEW_PLAN: PlanProposalWire = {
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

/** Shared with PreparingScreen, which narrates the same real generation. */
export const CAPTIONS = [
  'Reading your goals and schedule…',
  'Balancing muscle groups across the week…',
  'Picking exercises for your equipment…',
  'Setting reps and sets to your level…',
  'Almost there — final checks…',
];

type Phase = 'generating' | 'ready' | 'error';

/** Shape-of-the-answer placeholder; also PreparingScreen's skeleton. */
export function GhostCard() {
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
  const { colors } = useTheme();
  // Only used to reach this stack's own Pricing route on a quota refusal. The
  // app-wide useUpgradePrompt is no help here — it dispatches through
  // Progress → Settings → Pricing, and none of those exist while the onboarding
  // stack is mounted.
  const nav = useNavigation<OnboardingNav>();
  const { getToken } = useAuth();
  const { refresh } = usePlan();
  const {
    completeOnboarding,
    saveProfileDraft,
    needsSubmit,
    submitting,
    submitError,
    draft,
    preview,
    stashedPlan,
  } = useOnboarding();
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
  // Set when generation was REFUSED (free plan already used) rather than
  // failing. The default copy blames the network, which would be a lie here.
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanProposalWire | null>(null);
  const [status, setStatus] = useState<ProposalStatus>('pending');
  const [captionIdx, setCaptionIdx] = useState(0);
  const startedRef = useRef(false);
  // Latches only on a SUCCESSFUL draft submit, so Try-again re-runs it.
  const submittedRef = useRef(false);

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
        // Pre-auth answers land here unsaved — PUT them before generating so
        // the server builds from this user's actual profile. Inside the try
        // so a failure shares the error branch's Try-again.
        const firstSubmit = needsSubmit && !submittedRef.current;
        if (firstSubmit) {
          const ok = await saveProfileDraft();
          if (!ok) throw new Error('Profile save failed.');
          submittedRef.current = true;
          // Replay what CoachMatching couldn't do without a token. Non-fatal:
          // the preset also rides in profile preferences.
          if (Object.keys(draft.coachAnswers).length) {
            try {
              await updatePersonality(token, matchCoach(draft.coachAnswers));
            } catch {
              /* server keeps its default until Settings syncs it */
            }
          }
        }
        // A run that just (re)submitted keeps recovery on: a prior launch may
        // have left a pending proposal, and re-generating would burn it for
        // nothing. Explicit "Regenerate" (recoverFirst=false, already
        // submitted) still forces a fresh plan.
        if (recoverFirst || firstSubmit) {
          const existing = await fetchLatestProposal(token);
          if (existing) {
            setProposalId(existing.id);
            setPlan(existing.payload);
            setPhase('ready');
            return;
          }
          // The plan generated (and shown) pre-signup: adopt it verbatim.
          // Regenerating here could silently swap the plan the user chose.
          if (stashedPlan) {
            const adopted = await adoptPlanProposal(token, stashedPlan);
            setProposalId(adopted.proposal_id);
            setPlan(adopted.plan);
            setPhase('ready');
            return;
          }
        }
        const result = await generatePlan(token);
        setProposalId(result.proposal_id);
        setPlan(result.plan);
        setPhase('ready');
      } catch (e) {
        // A refusal is not a failure: the request was understood and declined
        // because the free plan generation is spent. Say that, instead of
        // showing an offline icon and inviting a retry that can't succeed.
        setBlockedMsg(isUpgradeError(e) ? e.upgrade.message : null);
        setPhase('error');
      }
    },
    [getToken, preview, needsSubmit, saveProfileDraft, draft.coachAnswers, stashedPlan],
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

  // The proposal-accept side latches separately from completeOnboarding, so a
  // retry after a failed completing PUT doesn't re-accept the plan.
  const acceptedRef = useRef(false);

  const handleAccept = async () => {
    if (!proposalId) return;
    if (preview) {
      setStatus('accepted');
      return;
    }
    setStatus('accepting');
    try {
      if (!acceptedRef.current) {
        const token = await getToken();
        if (!token) throw new Error('Not signed in.');
        await acceptPlanProposal(token, proposalId);
        await refresh();
        acceptedRef.current = true;
      }
      // 'accepted' only once the gate actually flips — announcing success
      // while the completing PUT can still fail left users on a dead screen.
      const done = await completeOnboarding();
      setStatus(done ? 'accepted' : 'failed');
    } catch {
      setStatus('failed');
    }
  };

  const caption = reduceMotion ? CAPTIONS[0] : CAPTIONS[captionIdx];

  return (
    <Screen scroll wash tabBarClearance={false}>
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
          initialOpenDay={null}
        />
      )}

      {phase === 'error' && (
        <Entering>
          <View style={styles.errorBox}>
            {/* Warning, not danger — the user did nothing wrong. And not a
                cloud-offline glyph when the allowance is simply spent: the
                request reached us and was understood, so an icon that says
                "no connection" sends them to check their wifi. */}
            <View style={styles.errorWell}>
              <Ionicons
                name={blockedMsg ? 'sparkles-outline' : 'cloud-offline-outline'}
                size={28}
                color={colors.warningText}
              />
            </View>
            <AppText variant="h3">
              {blockedMsg ? 'Plan limit reached' : "That didn't work"}
            </AppText>
            <AppText
              variant="body"
              color="textSecondary"
              align="center"
              style={styles.errorBody}
            >
              {blockedMsg ??
                "We couldn't build your plan just now. You can try again, or skip ahead and ask your coach for a plan anytime."}
            </AppText>
            {submitError ? (
              <AppText variant="caption" color="dangerText" align="center">
                {submitError}
              </AppText>
            ) : null}
            {/* A refusal and a failure need different buttons. "Try again" on a
                spent allowance retries something that is guaranteed to be
                refused again — the screen had the upgrade payload in hand and
                still offered the one action that couldn't work.
                `replace` rather than `navigate`: Pricing exits by replacing
                itself with BuildingPlan, so pushing would leave two
                BuildingPlans stacked. Replacing swaps this screen out and the
                one that comes back is a fresh mount, which re-runs generation
                on its own — succeeding now if they bought. */}
            {blockedMsg ? (
              <Button
                title="See plans"
                variant="primary"
                onPress={() => nav.replace('Pricing')}
              />
            ) : (
              <Button title="Try again" variant="primary" onPress={() => void generate(false)} />
            )}
            <Button
              title="Skip for now"
              variant="ghost"
              loading={submitting}
              // The completing PUT resends the full draft, so this works even
              // when the earlier draft save is what failed. On failure the
              // submitError above surfaces and the button stays.
              onPress={() => void completeOnboarding()}
            />
          </View>
        </Entering>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
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
    errorBox: {
      gap: spacing.md,
      marginTop: spacing.xxl,
      alignItems: 'center',
    },
    errorWell: {
      width: 64,
      height: 64,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.warningSoft,
      marginBottom: spacing.sm,
    },
    errorBody: { marginBottom: spacing.sm },
  }),
);

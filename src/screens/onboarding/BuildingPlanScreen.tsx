/**
 * The last mile of onboarding: the profile is saved, and this screen builds
 * the first plan in place — no chat hand-off. Recovers a still-pending
 * proposal after a crash/reload, otherwise fires one-shot generation, then
 * shows the PlanCard with "Start training". Accept (or "Skip for now" on
 * error) calls completeOnboarding(), which flips the gate into the app.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { makeStyles, spacing } from '@/theme';
import { AppText, Button, Card, Screen, Skeleton } from '@/components/ui';
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
  const { completeOnboarding, submitting } = useOnboarding();
  const reduceMotion = useReducedMotion();

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
    [getToken],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void generate(true);
  }, [generate]);

  const handleAccept = async () => {
    if (!proposalId) return;
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
        <AppText variant="h1">
          {phase === 'ready' ? 'Your first plan' : 'Building your plan'}
        </AppText>
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
    caption: { minHeight: 44 },
    ghost: { gap: 0 },
    ghostGap: { marginTop: spacing.md },
    ghostGapSm: { marginTop: spacing.sm },
    ghostRows: { marginTop: spacing.lg, gap: spacing.sm },
    errorBox: { gap: spacing.md, marginTop: spacing.lg },
    errorBody: { marginBottom: spacing.sm },
  }),
);

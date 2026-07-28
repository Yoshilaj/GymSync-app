/**
 * The beat between the last question and the account ask (pre-auth only) —
 * and it's not theatre anymore: the actual first plan generates here, before
 * any account exists, so "Save your plan" on SignUp is literally true.
 *
 * The percentage sprints early and settles under 95 while the server works
 * (an asymptote, since generation time varies), then closes to 100 the moment
 * the plan lands and hands off to the PlanPreview reveal. The finished plan
 * rides the draft stash across signup; BuildingPlan adopts it instead of
 * regenerating. On failure the old handoff survives: continue to SignUp with
 * answers only, and the plan builds post-signup exactly as before.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';
import { generateAnonymousPlan } from '@/api/plan';
import type { PlanProposalWire } from '@/voice/protocol';
import { AppText, Button, Chip, Entering, ProgressBar, Screen } from '@/components/ui';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { useOnboarding } from './OnboardingContext';
import { CAPTIONS, GhostCard, PREVIEW_PLAN } from './BuildingPlanScreen';
import { GOALS } from './options';

type Nav = NativeStackNavigationProp<Record<string, object | undefined>>;

/** How fast the asymptote climbs — ~86% at a typical 27s generation. */
const TAU_MS = 11_000;
const PREVIEW_MS = 2600;

export function PreparingScreen() {
  const nav = useNavigation<Nav>();
  const { colors } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const { draft, preview, buildAnonymousPayload, stashDraftWithPlan } =
    useOnboarding();

  const [phase, setPhase] = useState<'building' | 'error'>('building');
  const [errDetail, setErrDetail] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [captionIdx, setCaptionIdx] = useState(0);
  const [attempt, setAttempt] = useState(0);

  // Echo their answers while the build runs (BuildingPlan's trick).
  const goalLabel = GOALS.find((g) => g.value === draft.goals[0])?.label;
  const summary = [
    goalLabel,
    draft.trainingDays ? `${draft.trainingDays} days` : null,
    draft.sessionMinutes ? `${draft.sessionMinutes} min` : null,
  ].filter((s): s is string => !!s);

  // One live run at a time; Try-again bumps `attempt`, unmount invalidates.
  const runRef = useRef(0);

  useEffect(() => {
    const runId = ++runRef.current;
    const startedAt = Date.now();
    let plan: PlanProposalWire | null = null;
    let errored = false;

    const work = preview
      ? new Promise<PlanProposalWire>((resolve) =>
          setTimeout(() => resolve(PREVIEW_PLAN), PREVIEW_MS - 400),
        )
      : generateAnonymousPlan(buildAnonymousPayload()).then((r) => r.plan);

    void work
      .then(async (p) => {
        // Stash BEFORE the reveal: a crash between here and signup must
        // still resume with the plan the user is about to be shown.
        if (!preview) await stashDraftWithPlan(p);
        if (runRef.current === runId) plan = p;
      })
      .catch((e: unknown) => {
        if (runRef.current === runId) {
          errored = true;
          // Surface the real reason — "Network request failed" vs an HTTP
          // status tells the user (and us) whether the server is reachable.
          setErrDetail(e instanceof Error ? e.message : null);
          setPhase('error');
        }
      });

    const tick = setInterval(() => {
      if (runRef.current !== runId || errored) {
        clearInterval(tick);
        return;
      }
      if (plan) {
        setPct((prev) => {
          const next = Math.min(100, prev + 4);
          if (next >= 100) {
            clearInterval(tick);
            const done = plan;
            setTimeout(() => {
              // Replace: Back from the reveal should land on the last
              // question, not on a spent loading screen.
              if (runRef.current === runId) {
                nav.replace('PlanPreview', { plan: done });
              }
            }, 350);
          }
          return next;
        });
        return;
      }
      const elapsed = Date.now() - startedAt;
      setPct(Math.min(94, Math.round(94 * (1 - Math.exp(-elapsed / TAU_MS)))));
    }, reduceMotion ? 400 : 120);

    return () => {
      runRef.current++;
      clearInterval(tick);
    };
  }, [attempt, preview, buildAnonymousPayload, stashDraftWithPlan, nav, reduceMotion]);

  // Cycle the wait captions while building.
  useEffect(() => {
    if (phase !== 'building' || reduceMotion) return;
    const timer = setInterval(
      () => setCaptionIdx((i) => (i + 1) % CAPTIONS.length),
      2400,
    );
    return () => clearInterval(timer);
  }, [phase, reduceMotion]);

  const skipToSignUp = useCallback(() => {
    // The pre-signup build failed — the answers still travel via the stash
    // (written at the last question) and the plan builds post-signup instead.
    if (nav.canGoBack()) nav.goBack();
    nav.navigate('SignUp');
  }, [nav]);

  const caption = reduceMotion ? CAPTIONS[0] : CAPTIONS[captionIdx];

  return (
    <Screen wash tabBarClearance={false}>
      <View style={styles.top}>
        <AppText variant="display">Building your plan</AppText>
        {summary.length > 0 && phase === 'building' && (
          <View style={styles.summary}>
            {summary.map((s) => (
              <Chip key={s} label={s} tone="accent" size="sm" />
            ))}
          </View>
        )}
      </View>

      {phase === 'building' && (
        <>
          <View style={styles.meter}>
            <View style={styles.readout}>
              <AppText variant="statLg">{pct}</AppText>
              <AppText variant="h3" color="textSecondary" style={styles.unit}>
                %
              </AppText>
            </View>
            <ProgressBar value={pct / 100} gradient />
            <View style={styles.captionBox}>
              <Animated.View
                key={caption}
                entering={reduceMotion ? undefined : FadeIn.duration(300)}
                exiting={reduceMotion ? undefined : FadeOut.duration(300)}
              >
                <AppText variant="body" color="textSecondary" align="center">
                  {caption}
                </AppText>
              </Animated.View>
            </View>
          </View>
          <GhostCard />
        </>
      )}

      {phase === 'error' && (
        <Entering>
          <View style={styles.errorBox}>
            <View style={styles.errorWell}>
              <Ionicons
                name="cloud-offline-outline"
                size={28}
                color={colors.warningText}
              />
            </View>
            <AppText variant="h3">That didn't work</AppText>
            <AppText
              variant="body"
              color="textSecondary"
              align="center"
              style={styles.errorBody}
            >
              We couldn't build your plan just now. You can try again, or save
              your answers and let your coach build it right after sign-up.
            </AppText>
            {!!errDetail && (
              <AppText variant="caption" color="textTertiary" align="center">
                {errDetail}
              </AppText>
            )}
            <Button
              title="Try again"
              variant="primary"
              onPress={() => {
                setPhase('building');
                setErrDetail(null);
                setPct(0);
                setAttempt((a) => a + 1);
              }}
            />
            <Button title="Continue without it" variant="ghost" onPress={skipToSignUp} />
          </View>
        </Entering>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  top: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  meter: {
    alignItems: 'stretch',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  unit: { marginBottom: 2 },
  captionBox: { minHeight: 24, justifyContent: 'flex-start' },
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
}));

/**
 * The beat between the quiz and the reveal.
 *
 * The pause is not theatre — the preset is scored here and saved to the
 * server. If that save fails the flow still moves on; the server keeps its
 * default coach and the user is never stranded on an interstitial.
 */
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useAuth } from '@/auth/AuthContext';
import { updatePersonality } from '@/api/personality';
import { AppText, ProgressBar, Screen } from '@/components/ui';
import { makeStyles, radius, spacing } from '@/theme';
import { useOnboarding } from './OnboardingContext';
import { useStepFlow } from './useStepFlow';
import { matchCoach } from './coachMatch';

const HOLD_MS = 1600;

export function CoachMatchingScreen() {
  const styles = useStyles();
  const { getToken } = useAuth();
  const { draft, preview, preAuth } = useOnboarding();
  const { progress, prevProgress, goNext } = useStepFlow();
  const reduceMotion = useReducedMotion();
  const done = useRef(false);

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [pulse, reduceMotion]);

  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.18 }],
    opacity: 0.35 - pulse.value * 0.25,
  }));

  // Everything the timer needs, read at fire time. Putting these in the dep
  // array instead would let a re-render's cleanup cancel the pending advance
  // and strand the user on a screen with no controls.
  // preAuth counts as "skip the save" too: there's no token yet, and
  // BuildingPlan replays this call once the account exists.
  const skipSave = preview || preAuth;
  const latest = useRef({ answers: draft.coachAnswers, skipSave, getToken, goNext });
  latest.current = { answers: draft.coachAnswers, skipSave, getToken, goNext };

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    let cancelled = false;

    const run = async () => {
      const { answers, skipSave: skip, getToken: token$, goNext: advance } =
        latest.current;
      if (!skip) {
        try {
          await updatePersonality(await token$(), matchCoach(answers));
        } catch {
          // Non-fatal: the reveal still shows the matched coach, and the
          // server falls back to its own default until Settings syncs it.
        }
      }
      if (!cancelled) {
        // Replace so Back from the reveal returns to the last question
        // instead of re-entering this screen and bouncing forward again.
        void advance({ replace: true });
      }
    };

    const timer = setTimeout(run, HOLD_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <Screen tabBarClearance={false}>
      <View style={styles.top}>
        <ProgressBar
          value={progress}
          animateFrom={prevProgress}
          gradient
          animated
        />
      </View>

      <View style={styles.body}>
        <View style={styles.orbWrap}>
          <Animated.View style={[styles.ring, ring]} />
          <View style={styles.core} />
        </View>
        <AppText variant="h2" align="center">
          Matching your coach…
        </AppText>
        <AppText variant="body" color="textSecondary" align="center">
          Reading your answers to find the voice that'll actually get you moving.
        </AppText>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  top: { paddingTop: spacing.sm },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  orbWrap: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  ring: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: radius.pill,
    backgroundColor: t.colors.accent,
  },
  core: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: t.colors.accent,
  },
}));

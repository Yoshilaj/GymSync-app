/**
 * The beat between the quiz and the reveal.
 *
 * The pause is not theatre — the preset is scored here and saved to the
 * server. If that save fails the flow still moves on; the server keeps its
 * default coach and the user is never stranded on an interstitial.
 */
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useAuth } from '@/auth/AuthContext';
import { updatePersonality } from '@/api/personality';
import { AppText, ProgressBar, RingsMotif, Screen } from '@/components/ui';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { useOnboarding } from './OnboardingContext';
import { useStepFlow } from './useStepFlow';
import { matchCoach } from './coachMatch';

const HOLD_MS = 1600;

export function CoachMatchingScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const focused = useIsFocused();
  const { getToken } = useAuth();
  const { draft, preview, preAuth } = useOnboarding();
  const { progress, prevProgress, goNext } = useStepFlow();
  const reduceMotion = useReducedMotion();
  const done = useRef(false);

  // Two stroke rings expanding out of the sphere, phase-offset by half a
  // cycle — radar sweeping for a match, not a throb. Non-reversing repeat
  // restarts each ring from the sphere's edge.
  const ringA = useSharedValue(0);
  const ringB = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      // One static halo; the second ring parks at full expansion (opacity 0).
      ringA.value = 0.4;
      ringB.value = 1;
      return;
    }
    const sweep = () =>
      withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      );
    ringA.value = sweep();
    ringB.value = withDelay(800, sweep());
  }, [ringA, ringB, reduceMotion]);

  const ringAStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ringA.value * 0.5 }],
    opacity: 0.5 * (1 - ringA.value),
  }));
  const ringBStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ringB.value * 0.5 }],
    opacity: 0.5 * (1 - ringB.value),
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
    <Screen fill="brand" tabBarClearance={false}>
      {/* Dark glyphs would be illegible on the brand fill. */}
      {focused && <StatusBar style="light" />}
      <RingsMotif color={colors.textInverse} width={320} height={220} />

      <View style={styles.top}>
        <ProgressBar
          value={progress}
          animateFrom={prevProgress}
          tone="onBrand"
          animated
        />
      </View>

      <View style={styles.body}>
        <View style={styles.orbWrap}>
          <Animated.View style={[styles.ring, ringAStyle]} />
          <Animated.View style={[styles.ring, ringBStyle]} />
          <View style={styles.core} />
        </View>
        <AppText variant="h2" align="center" color={colors.textInverse}>
          Matching your coach…
        </AppText>
        <AppText
          variant="body"
          align="center"
          color={colors.textInverse}
          style={styles.dimmed}
        >
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
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: t.colors.textInverse,
  },
  // Frosted sphere on the brand fill — same material as the reveal's glyph
  // well, one size up: the radar finds the coach, the reveal names them.
  core: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: t.colors.onBrandOverlay,
  },
  // Secondary text on brand steps back with opacity, not a dimmer token.
  dimmed: { opacity: 0.82 },
}));

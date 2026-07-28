/**
 * The beat between the last question and the account ask (pre-auth only).
 *
 * Counts to 100 while the draft settles into the stash, then hands off to
 * SignUp. Nothing generates here — the real build happens post-signup on
 * BuildingPlan — but arriving at "Save your plan" cold, one tap after a
 * referral-code field, undersold the moment. The count gives the answers
 * visible weight, then pops itself so Back from SignUp lands on the last
 * question, not on a spent interstitial (the CoachMatching trick).
 */
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useReducedMotion } from 'react-native-reanimated';
import { AppText, ProgressBar, Screen } from '@/components/ui';
import { makeStyles, spacing } from '@/theme';

type Nav = NativeStackNavigationProp<Record<string, object | undefined>>;

const DURATION_MS = 2600;
const CAPTIONS = [
  'Reading your answers…',
  'Sketching your training week…',
];

export function PreparingScreen() {
  const nav = useNavigation<Nav>();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const [pct, setPct] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const startedAt = Date.now();
    // Driving state (not a reanimated value) on purpose: the % label and the
    // bar must agree exactly, and 30fps state ticks are plenty for a number.
    const tick = setInterval(() => {
      const t = Math.min(1, (Date.now() - startedAt) / DURATION_MS);
      // Ease-out so the count sprints early and settles into 100.
      const eased = 1 - (1 - t) * (1 - t);
      setPct(Math.round(eased * 100));
      if (t >= 1 && !done.current) {
        done.current = true;
        clearInterval(tick);
        // Pop self first (this navigator is blurred a beat later), then hand
        // off to the parent auth stack — Back from SignUp lands on the last
        // question with the in-memory draft intact. Guarded: in the normal
        // flow there's always a question underneath, but never warn if not.
        if (nav.canGoBack()) nav.goBack();
        nav.navigate('SignUp');
      }
    }, reduceMotion ? 400 : 33);
    return () => clearInterval(tick);
  }, [nav, reduceMotion]);

  const caption = CAPTIONS[pct < 55 ? 0 : 1];

  return (
    <Screen tabBarClearance={false}>
      <View style={styles.body}>
        <AppText variant="statLg">{pct}%</AppText>
        <View style={styles.bar}>
          <ProgressBar value={pct / 100} gradient />
        </View>
        <AppText variant="body" color="textSecondary" align="center">
          {caption}
        </AppText>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  bar: { alignSelf: 'stretch', paddingHorizontal: spacing.xxl },
}));

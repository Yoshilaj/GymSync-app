/**
 * The first screen of the app.
 *
 * Before this existed, a brand-new user's first impression was a sign-in form —
 * a password field explains nothing about why GymSync is different. What makes
 * it different is that the coach talks to you mid-set, so that's the whole
 * screen: a silent listening mark, one sentence, one action.
 */
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { AppText, Button, Screen } from '@/components/ui';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

type Nav = NativeStackNavigationProp<AuthStackParamList>;

export function WelcomeScreen() {
  const nav = useNavigation<Nav>();
  const { colors } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();

  // A slow breath, not a waveform — the mic isn't on, and animating as though
  // it were would be a lie the whole app has to keep.
  const breath = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [breath, reduceMotion]);

  const outerRing = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.12 }],
    opacity: 0.12 + breath.value * 0.06,
  }));
  const innerRing = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.07 }],
    opacity: 0.22 + breath.value * 0.08,
  }));

  return (
    <Screen
      wash
      tabBarClearance={false}
      footer={
        <View style={styles.footer}>
          <Button
            title="Get started"
            variant="primary"
            onPress={() => nav.navigate('SignUp')}
          />
          <Pressable
            onPress={() => nav.navigate('SignIn')}
            hitSlop={12}
            accessibilityRole="button"
            style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}
          >
            <AppText variant="caption" color="textSecondary">
              Already have an account?{' '}
            </AppText>
            <AppText variant="caption" color="accentText">
              Sign in
            </AppText>
          </Pressable>
        </View>
      }
    >
      <View style={styles.body}>
        <View style={styles.mark}>
          <Animated.View style={[styles.ring, styles.ringOuter, outerRing]} />
          <Animated.View style={[styles.ring, styles.ringInner, innerRing]} />
          <View style={styles.core}>
            <Ionicons name="mic" size={34} color={colors.textInverse} />
          </View>
        </View>

        <AppText variant="display" align="center" style={styles.headline}>
          A coach that listens while you train.
        </AppText>
        <AppText variant="body" color="textSecondary" align="center">
          Real-time cues, honest feedback, and a plan built around the time you
          actually have.
        </AppText>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  mark: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  ring: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: t.colors.accent,
  },
  ringOuter: { width: 220, height: 220 },
  ringInner: { width: 152, height: 152 },
  core: {
    width: 92,
    height: 92,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.accent,
    ...t.shadows.glow,
  },
  headline: { marginTop: spacing.sm },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  signIn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
  },
  pressed: { opacity: 0.6 },
}));

import { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, gradients, radius, shadows, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import { usePlan } from '@/context/PlanContext';
import { PlanStackParamList } from '@/navigation/PlanStack';

const { width } = Dimensions.get('window');
// A brief branded transition into the session — long enough to read, short
// enough to never feel like a fake loading screen.
const TRANSITION_MS = 900;

type Nav = NativeStackNavigationProp<PlanStackParamList, 'LiveWorkoutStart'>;
type Rt = RouteProp<PlanStackParamList, 'LiveWorkoutStart'>;

const BAR_COUNT = 5;
const BAR_HEIGHTS = [28, 44, 56, 36, 20];

export function LiveWorkoutStartScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { todaysWorkout, getWorkoutById } = usePlan();
  const workout =
    (route.params?.workoutId ? getWorkoutById(route.params.workoutId) : undefined) ??
    todaysWorkout ?? {
      id: 'freeform',
      dayLabel: '',
      title: 'Open workout',
      estMinutes: 45,
      exercises: [],
    };
  const workoutId = workout.id;

  const progress = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const barAnims = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3)),
  ).current;

  useEffect(() => {
    let navigated = false;

    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    Animated.timing(progress, {
      toValue: 1,
      duration: TRANSITION_MS,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !navigated) {
        navigated = true;
        nav.replace('WorkoutSession', { workoutId: workout.id });
      }
    });

    const waveAnims = barAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 350 + i * 40,
            delay: i * 90,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.15,
            duration: 350 + i * 40,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    waveAnims.forEach((w) => w.start());

    return () => {
      navigated = true;
      waveAnims.forEach((w) => w.stop());
    };
  }, []);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient
        colors={gradients.screenWash}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.content, { opacity: fadeIn }]}>
        <View style={styles.iconRingOuter}>
          <View style={styles.iconRingInner}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={styles.iconGrad}
            >
              <Ionicons name="sparkles" size={26} color={colors.textInverse} />
            </LinearGradient>
          </View>
        </View>

        <AppText variant="label" color="accentText" style={styles.eyebrow}>
          Live workout
        </AppText>
        <AppText variant="display" align="center">
          {workout.title}
        </AppText>
        <AppText variant="caption">
          {workout.exercises.length} exercises · {workout.estMinutes} min
        </AppText>

        <View style={styles.waveform}>
          {barAnims.map((anim, i) => (
            <Animated.View
              key={i}
              style={[
                styles.waveBar,
                {
                  height: BAR_HEIGHTS[i],
                  transform: [{ scaleY: anim }],
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>

        <AppText variant="caption">Preparing your session…</AppText>
      </Animated.View>

      <Pressable
        onPress={() => nav.goBack()}
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
        hitSlop={12}
      >
        <Ionicons name="close" size={14} color={colors.textSecondary} />
        <AppText variant="caption">Cancel</AppText>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconRingOuter: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(46,144,234,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconRingInner: {
    ...shadows.glow,
    borderRadius: 36,
  },
  iconGrad: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  eyebrow: { letterSpacing: 2.5 },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 64,
    marginVertical: spacing.sm,
  },
  waveBar: {
    width: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    opacity: 0.85,
  },
  progressTrack: {
    width: width - spacing.xl * 4,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...shadows.xs,
  },
  cancelBtnPressed: { opacity: 0.6 },
});

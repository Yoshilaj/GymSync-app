import { useEffect, useRef } from 'react';
import {
  View,
  Text,
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
import { colors, spacing, radius } from '@/theme';
import { PlanStackParamList } from '@/navigation/PlanStack';

const { width } = Dimensions.get('window');
const LOAD_DURATION = 3000;

type Nav = NativeStackNavigationProp<PlanStackParamList, 'LiveWorkoutStart'>;
type Rt = RouteProp<PlanStackParamList, 'LiveWorkoutStart'>;

const BAR_COUNT = 5;
const BAR_HEIGHTS = [28, 44, 56, 36, 20];

export function LiveWorkoutStartScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const workoutId = route.params?.workoutId ?? 'w-push';

  const progress = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const barAnims = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    let navigated = false;

    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    Animated.timing(progress, {
      toValue: 1,
      duration: LOAD_DURATION,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !navigated) {
        navigated = true;
        nav.replace('WorkoutSession', { workoutId });
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
        ])
      )
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

  const handleCancel = () => {
    nav.goBack();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient
        colors={['#E9F4FF', '#F3F7FD', '#F3F7FD']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.content, { opacity: fadeIn }]}>
        {/* FAB-style icon ring */}
        <View style={styles.iconRingOuter}>
          <View style={styles.iconRingInner}>
            <LinearGradient
              colors={['#4FB0FF', '#2E90EA', '#1A6BC0']}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={styles.iconGrad}
            >
              <Ionicons name="sparkles" size={26} color="#fff" />
            </LinearGradient>
          </View>
        </View>

        {/* Label + heading */}
        <Text style={styles.eyebrow}>LIVE WORKOUT</Text>
        <Text style={styles.heading}>Starting{'\n'}Now</Text>

        {/* Animated waveform */}
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

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]}>
            <LinearGradient
              colors={['#4FB0FF', '#2E90EA', '#1A6BC0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Shimmer cap */}
            <View style={styles.progressCap} />
          </Animated.View>
        </View>

        <Text style={styles.subtext}>Preparing your session…</Text>
      </Animated.View>

      {/* Cancel */}
      <Pressable
        onPress={handleCancel}
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
        hitSlop={12}
      >
        <Ionicons name="close" size={14} color={colors.textMuted} />
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },

  // Icon
  iconRingOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(46,144,234,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconRingInner: {
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    borderRadius: 36,
  },
  iconGrad: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
  },

  // Text
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
    color: colors.accent,
    textTransform: 'uppercase',
  },
  heading: {
    fontSize: 42,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -1.5,
    textAlign: 'center',
    lineHeight: 46,
  },

  // Waveform
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

  // Progress bar
  progressTrack: {
    width: width - spacing.xl * 4,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressCap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 12,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },

  subtext: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
    letterSpacing: 0.1,
  },

  // Cancel button
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
  cancelBtnPressed: {
    opacity: 0.6,
    backgroundColor: colors.accentSoft,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
});

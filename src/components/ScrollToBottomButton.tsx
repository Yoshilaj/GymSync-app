import { Platform, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { colors, radius, shadows, spacing } from '@/theme';

interface Props {
  onPress: () => void;
}

/** Floating glass chevron that jumps the thread back to the newest message. */
export function ScrollToBottomButton({ onPress }: Props) {
  const icon = <Ionicons name="chevron-down" size={18} color={colors.textPrimary} />;
  return (
    <Animated.View
      entering={FadeInDown.duration(160)}
      exiting={FadeOutDown.duration(140)}
      style={styles.wrap}
    >
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Scroll to latest message"
      >
        {Platform.OS === 'ios' ? (
          <BlurView tint="light" intensity={70} style={styles.btn}>
            {icon}
          </BlurView>
        ) : (
          <Animated.View style={[styles.btn, styles.solid]}>{icon}</Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: spacing.md,
    borderRadius: radius.pill,
    ...shadows.md,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  solid: { backgroundColor: colors.card },
});

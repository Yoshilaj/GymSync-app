import { Platform, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

interface Props {
  onPress: () => void;
}

/** Floating glass chevron that jumps the thread back to the newest message. */
export function ScrollToBottomButton({ onPress }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
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

const useStyles = makeStyles((t) => ({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: spacing.md,
    borderRadius: radius.pill,
    ...t.shadows.md,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.colors.border,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  solid: { backgroundColor: t.colors.card },
}));

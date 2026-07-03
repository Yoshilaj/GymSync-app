import { forwardRef } from 'react';
import { Pressable, PressableProps, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable with a subtle press-in scale — the app's standard touch feedback
 * for cards, rows, and pills.
 */
export const AnimatedPressable = forwardRef<View, PressableProps>(
  function AnimatedPressable({ onPressIn, onPressOut, style, ...rest }, ref) {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
    }));

    return (
      <AnimatedPressableBase
        ref={ref}
        {...rest}
        style={[style as object, animatedStyle]}
        onPressIn={(e) => {
          scale.value = withTiming(0.97, { duration: 120 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withTiming(1, { duration: 120 });
          onPressOut?.(e);
        }}
      />
    );
  },
);

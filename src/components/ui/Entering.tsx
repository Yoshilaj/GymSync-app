import { ReactNode } from 'react';
import Animated, {
  Easing,
  FadeInDown,
  useReducedMotion,
} from 'react-native-reanimated';

interface Props {
  children: ReactNode;
  /** Position in a list — staggers the entrance. Capped so rows mounted
   * mid-scroll in a FlatList don't wait seconds for their turn. */
  index?: number;
  enabled?: boolean;
}

/** Standard "content arrives" animation: a soft staggered fade-up, no bounce.
 * Respects Reduce Motion on its own, so call sites don't each need a guard. */
export function Entering({ children, index = 0, enabled = true }: Props) {
  const reduceMotion = useReducedMotion();
  if (!enabled || reduceMotion) return <>{children}</>;
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 50)
        .duration(280)
        .easing(Easing.out(Easing.quad))}
    >
      {children}
    </Animated.View>
  );
}

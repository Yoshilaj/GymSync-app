import { ReactNode } from 'react';
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

interface Props {
  children: ReactNode;
  /** Position in a list — staggers the entrance. Capped so rows mounted
   * mid-scroll in a FlatList don't wait seconds for their turn. */
  index?: number;
  enabled?: boolean;
  /**
   * Also animate removal, and let the rows below slide up to close the gap.
   * For lists the user can edit. Requires stable keys — with a duplicated key
   * the exit plays on the wrong row.
   */
  animateExit?: boolean;
}

/** Standard "content arrives" animation: a soft staggered fade-up, no bounce.
 * Respects Reduce Motion on its own, so call sites don't each need a guard. */
export function Entering({
  children,
  index = 0,
  enabled = true,
  animateExit = false,
}: Props) {
  const reduceMotion = useReducedMotion();
  if (!enabled || reduceMotion) return <>{children}</>;
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 50)
        .duration(280)
        .easing(Easing.out(Easing.quad))}
      exiting={animateExit ? FadeOut.duration(160) : undefined}
      layout={
        animateExit
          ? LinearTransition.duration(220).easing(Easing.out(Easing.quad))
          : undefined
      }
    >
      {children}
    </Animated.View>
  );
}

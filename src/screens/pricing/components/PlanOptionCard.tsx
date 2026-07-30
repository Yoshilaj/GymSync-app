/**
 * One billing period, as a card in a two-up row — and the selected one is
 * physically elevated.
 *
 * Scale alone doesn't sell "elevated" on a half-width card (1.03 is ~5pt), so
 * the lift is relative: the chosen card rises and brightens while its
 * neighbour settles back to 0.92 opacity. The pair moving in opposite
 * directions is what the eye reads as depth.
 *
 * Selected wears the primary Button's gradient + glow — choosing a price and
 * confirming it are the same decision, so they share a skin. Shadows swap
 * statically under the transform (iOS can't animate shadow props cheaply;
 * the motion masks the swap). Reduce Motion gets instant states.
 *
 * Not built on AnimatedPressable: its press-scale writes `transform` after
 * caller styles, which would erase the elevation transform. The press
 * feedback here is the Button convention instead (opacity 0.85).
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/ui';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

interface Props {
  /** "$14.99" */
  price: string;
  /** "/ month", "/ annual" */
  unit: string;
  selected: boolean;
  onPress: () => void;
}

export function PlanOptionCard({ price, unit, selected, onPress }: Props) {
  const { gradients } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();

  const lift = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    const target = selected ? 1 : 0;
    lift.value = reduceMotion
      ? target
      : withTiming(target, { duration: 180, easing: Easing.out(Easing.quad) });
  }, [selected, reduceMotion, lift]);

  const liftStyle = useAnimatedStyle(() => ({
    opacity: 0.92 + 0.08 * lift.value,
    transform: [
      { scale: 1 + 0.03 * lift.value },
      { translateY: -3 * lift.value },
    ],
  }));

  const ink = selected ? 'textInverse' : 'textPrimary';
  const quiet = selected ? 'textInverse' : 'textSecondary';

  return (
    <Animated.View
      style={[styles.wrap, selected ? styles.wrapSelected : styles.wrapResting, liftStyle]}
    >
      <Pressable
        onPress={() => {
          if (selected) return;
          void Haptics.selectionAsync();
          onPress();
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${price} ${unit}`}
        style={({ pressed }) => [
          styles.card,
          !selected && styles.cardResting,
          pressed && !selected && styles.pressed,
        ]}
      >
        {selected ? (
          <LinearGradient
            colors={gradients.button}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {/* Baseline-shared so the figure and its cadence read as one object. */}
        <View style={styles.priceRow}>
          <AppText variant="h3" color={ink} numberOfLines={1}>
            {price}
          </AppText>
          <AppText variant="caption" color={quiet} numberOfLines={1}>
            {unit}
          </AppText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  // Shadow on the wrapper; the card clips the gradient and can't carry one.
  //
  // The wrapper needs its own opaque fill even though the card covers it
  // completely: without one, iOS derives the shadow from the clipped child's
  // alpha rather than from a clean rounded rect, and the glow renders as a
  // hard blue line along the bottom edge instead of a halo.
  wrap: { flex: 1, borderRadius: radius.lg },
  wrapSelected: { backgroundColor: t.colors.accent, ...t.shadows.glowSoft },
  wrapResting: { backgroundColor: t.colors.card, ...t.shadows.xs },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    // Tighter than the usual card gutter: at half-width, 16pt each side would
    // squeeze "$149.90 / annual" onto two lines.
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 64,
    flex: 1,
    // The price is the card's only content, so it takes the middle on both
    // axes — a lone line pinned to a corner reads as a fragment of something
    // that was supposed to be there.
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardResting: { backgroundColor: t.colors.card },
  pressed: { opacity: 0.85 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
}));

import { useContext, useEffect, useRef, useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients, layout, shadows } from '@/theme';
import { GlassLozenge, TabBarSurface } from '@/components/TabBarSurface';
import { getTodaysWorkout } from '@/data/mockPlan';

const SLIDE = { duration: 220, easing: Easing.out(Easing.quad) };
// Horizontal breathing room between the lozenge and its slot's edges.
const LOZENGE_INSET = 5;
// Finger travel before a touch becomes a drag — small enough to feel
// instant, big enough that a still tap stays a tap.
const PICKUP_DISTANCE = 4;

const TABS: Record<
  string,
  { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }
> = {
  Plan: { on: 'calendar', off: 'calendar-outline' },
  Sync: { on: 'chatbubble-ellipses', off: 'chatbubble-ellipses-outline' },
  // Progress doubles as the profile surface — person icon, not a chart.
  Progress: { on: 'person-circle', off: 'person-circle-outline' },
};

const FAB_ROUTE = 'LiveWorkout';

export function AppTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);

  const barBottom = Math.max(insets.bottom, layout.TAB_BAR_BOTTOM_MIN);

  // The active-tab glass lozenge slides to the touched tab on press-down,
  // and — like the system/Instagram bar — dragging picks it up so it rides
  // under the finger; releasing selects the tab it lands on.
  const [rowWidth, setRowWidth] = useState(0);
  const slotWidth = rowWidth / state.routes.length;
  const lozengeWidth = slotWidth - LOZENGE_INSET * 2;
  // The FAB slot is a spacer, not a tab — the lozenge can't rest there.
  const maxSlot = state.routes.reduce(
    (max, route, index) => (route.name === FAB_ROUTE ? max : index),
    0,
  );
  const minX = LOZENGE_INSET;
  const maxX = maxSlot * slotWidth + LOZENGE_INSET;

  // Lozenge left edge in px (drives both slot snaps and free drag).
  const x = useSharedValue(state.index * slotWidth + LOZENGE_INSET);
  const hold = useSharedValue(0);
  const drag = useSharedValue(0);
  const hoverSlot = useSharedValue(state.index);
  const activeSlot = useSharedValue(state.index);
  const hadLayout = useRef(false);

  useEffect(() => {
    if (slotWidth <= 0) return;
    activeSlot.value = state.index;
    const target = state.index * slotWidth + LOZENGE_INSET;
    if (!hadLayout.current) {
      // First layout: place, don't animate.
      hadLayout.current = true;
      x.value = target;
    } else {
      x.value = withTiming(target, SLIDE);
    }
  }, [state.index, slotWidth, x, activeSlot]);

  const lozengeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      // Swells slightly on press, a touch more while dragged.
      { scale: 1 + hold.value * 0.07 + drag.value * 0.06 },
    ],
  }));

  const onTabPressIn = (index: number) => {
    x.value = withTiming(index * slotWidth + LOZENGE_INSET, SLIDE);
    hold.value = withTiming(1, { duration: 140 });
  };
  const onTabPressOut = () => {
    // A pickup cancels the pressable — the pan gesture owns cleanup then.
    if (drag.value > 0) return;
    hold.value = withTiming(0, { duration: 180 });
    // If the touch was cancelled without navigating, glide home.
    x.value = withTiming(activeSlot.value * slotWidth + LOZENGE_INSET, SLIDE);
  };

  const selectTab = (slot: number) => {
    const route = state.routes[slot];
    if (!route || route.name === FAB_ROUTE) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (state.index !== slot && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params as never);
    }
  };

  const pickupHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const crossHaptic = () => {
    void Haptics.selectionAsync();
  };

  const pan = Gesture.Pan()
    .maxPointers(1)
    .minDistance(PICKUP_DISTANCE)
    .onStart((e) => {
      'worklet';
      drag.value = withTiming(1, { duration: 140 });
      hold.value = withTiming(1, { duration: 140 });
      const left = Math.min(
        Math.max(e.x - lozengeWidth / 2, minX),
        maxX,
      );
      hoverSlot.value = Math.round((left - LOZENGE_INSET) / slotWidth);
      // Ease under the finger rather than teleporting.
      x.value = withTiming(left, { duration: 120 });
      runOnJS(pickupHaptic)();
    })
    .onUpdate((e) => {
      'worklet';
      const left = Math.min(
        Math.max(e.x - lozengeWidth / 2, minX),
        maxX,
      );
      x.value = left;
      const slot = Math.min(
        Math.max(Math.round((left - LOZENGE_INSET) / slotWidth), 0),
        maxSlot,
      );
      if (slot !== hoverSlot.value) {
        hoverSlot.value = slot;
        runOnJS(crossHaptic)();
      }
    })
    .onEnd(() => {
      'worklet';
      const slot = hoverSlot.value;
      x.value = withTiming(slot * slotWidth + LOZENGE_INSET, SLIDE);
      runOnJS(selectTab)(slot);
    })
    .onFinalize((_e, success) => {
      'worklet';
      drag.value = withTiming(0, { duration: 180 });
      hold.value = withTiming(0, { duration: 180 });
      if (!success) {
        x.value = withTiming(
          activeSlot.value * slotWidth + LOZENGE_INSET,
          SLIDE,
        );
      }
    });

  return (
    <View
      style={[styles.wrap, { bottom: barBottom }]}
      onLayout={(e) =>
        // Report bottom-of-screen-relative clearance so any consumer of
        // useBottomTabBarHeight() gets a usable number for a floating bar.
        onHeightChange?.(e.nativeEvent.layout.height + barBottom)
      }
    >
      <TabBarSurface style={styles.surface}>
        <GestureDetector gesture={pan}>
          <View
            style={styles.row}
            onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
          >
            {slotWidth > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.lozengeWrap,
                  { width: lozengeWidth },
                  lozengeStyle,
                ]}
              >
                <GlassLozenge style={styles.lozenge} />
              </Animated.View>
            )}
            {state.routes.map((route, index) => {
              const focused = state.index === index;

              if (route.name === FAB_ROUTE) {
                // Spacer only — the FAB itself renders outside the clipped
                // glass surface (it pokes above the bar's top edge).
                return <View key={route.key} style={styles.tab} />;
              }

              const icons = TABS[route.name];
              return (
                <Pressable
                  key={route.key}
                  onPress={() => selectTab(index)}
                  onPressIn={() => onTabPressIn(index)}
                  onPressOut={onTabPressOut}
                  style={styles.tab}
                  android_ripple={{ color: 'transparent' }}
                >
                  <TabIcon
                    name={focused ? icons.on : icons.off}
                    color={focused ? colors.accent : colors.textSecondary}
                    index={index}
                    slotWidth={slotWidth}
                    x={x}
                    drag={drag}
                    lozengeWidth={lozengeWidth}
                  />
                </Pressable>
              );
            })}
          </View>
        </GestureDetector>
      </TabBarSurface>

      <FabButton
        // Center the FAB over the last of the equal-width slots.
        style={
          rowWidth > 0
            ? { right: rowWidth / (2 * state.routes.length) - layout.TAB_FAB_SIZE / 2 }
            : undefined
        }
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          const route = state.routes.find((r) => r.name === FAB_ROUTE);
          const event = route
            ? navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              })
            : undefined;
          if (!event?.defaultPrevented) {
            (navigation as any).navigate('Plan', {
              screen: 'LiveWorkoutStart',
              params: { workoutId: getTodaysWorkout().id },
            });
          }
        }}
      />
    </View>
  );
}

/** Tab glyph that pops when the dragged lozenge hovers over its slot. */
function TabIcon({
  name,
  color,
  index,
  slotWidth,
  x,
  drag,
  lozengeWidth,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  index: number;
  slotWidth: number;
  x: SharedValue<number>;
  drag: SharedValue<number>;
  lozengeWidth: number;
}) {
  const style = useAnimatedStyle(() => {
    if (slotWidth <= 0) return { transform: [{ scale: 1 }] };
    const center = x.value + lozengeWidth / 2;
    const hovered =
      drag.value > 0.5 &&
      center >= index * slotWidth &&
      center < (index + 1) * slotWidth;
    return {
      transform: [{ scale: withTiming(hovered ? 1.18 : 1, { duration: 120 }) }],
    };
  }, [slotWidth, index, lozengeWidth]);

  return (
    <Animated.View style={style}>
      <Ionicons name={name} size={25} color={color} />
    </Animated.View>
  );
}

function FabButton({
  onPress,
  style,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.fabSlot, style]} hitSlop={6}>
      <View style={styles.fabShadow}>
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.fab}
        >
          <LiveIcon />
        </LinearGradient>
      </View>
    </Pressable>
  );
}

function LiveIcon() {
  return (
    <View style={liveStyles.wrap}>
      <View style={[liveStyles.bar, liveStyles.barOne]} />
      <View style={[liveStyles.bar, liveStyles.barTwo]} />
      <View style={[liveStyles.bar, liveStyles.barThree]} />
      <Ionicons
        name="sparkles"
        size={11}
        color="#fff"
        style={liveStyles.sparkle}
      />
    </View>
  );
}

const liveStyles = StyleSheet.create({
  wrap: {
    width: 30,
    height: 30,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
    width: 3,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  barOne: {
    left: 5,
    top: 8,
    height: 14,
  },
  barTwo: {
    left: 11,
    top: 5,
    height: 20,
  },
  barThree: {
    right: 5,
    top: 12,
    height: 10,
  },
  sparkle: {
    position: 'absolute',
    top: -1,
    right: -3,
    textShadowColor: 'rgba(255,255,255,0.6)',
    textShadowRadius: 4,
  },
});

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: layout.TAB_BAR_H_INSET,
    right: layout.TAB_BAR_H_INSET,
    height: layout.TAB_BAR_BASE_HEIGHT,
  },
  surface: { flex: 1 },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lozengeWrap: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
  },
  lozenge: { flex: 1 },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The FAB floats over the pill's last slot, outside the clipped surface,
  // vertically centered so it sits level with the other tabs.
  fabSlot: {
    position: 'absolute',
    top: (layout.TAB_BAR_BASE_HEIGHT - layout.TAB_FAB_SIZE) / 2,
    right: 0,
  },
  fabShadow: {
    ...shadows.glow,
    borderRadius: layout.TAB_FAB_SIZE / 2 + 1,
  },
  fab: {
    width: layout.TAB_FAB_SIZE,
    height: layout.TAB_FAB_SIZE,
    borderRadius: layout.TAB_FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
});

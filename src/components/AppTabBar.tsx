import { useContext, useEffect, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients, layout, shadows } from '@/theme';
import { AppText } from '@/components/ui/AppText';
import { GlassLozenge, TabBarSurface } from '@/components/TabBarSurface';
import { getTodaysWorkout } from '@/data/mockPlan';

const SLIDE = { duration: 220, easing: Easing.out(Easing.quad) };

const TABS: Record<
  string,
  { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }
> = {
  Plan: { on: 'calendar', off: 'calendar-outline' },
  Sync: { on: 'chatbubble-ellipses', off: 'chatbubble-ellipses-outline' },
  Progress: { on: 'stats-chart', off: 'stats-chart-outline' },
  Settings: { on: 'settings', off: 'settings-outline' },
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

  // The active-tab glass lozenge: slides to the touched tab on press-down
  // (like the system tab bar) and swells slightly while held (like the
  // liquid-glass toggle knob).
  const [rowWidth, setRowWidth] = useState(0);
  const slotWidth = rowWidth / state.routes.length;
  const slot = useSharedValue(state.index);
  const hold = useSharedValue(0);
  const activeIndexRef = useRef(state.index);
  activeIndexRef.current = state.index;

  useEffect(() => {
    slot.value = withTiming(state.index, SLIDE);
  }, [state.index, slot]);

  const lozengeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: slot.value * slotWidth + 5 },
      { scale: 1 + hold.value * 0.07 },
    ],
  }), [slotWidth]);

  const onTabPressIn = (index: number) => {
    slot.value = withTiming(index, SLIDE);
    hold.value = withTiming(1, { duration: 140 });
  };
  const onTabPressOut = () => {
    hold.value = withTiming(0, { duration: 180 });
    // If the touch was cancelled without navigating, glide home.
    slot.value = withTiming(activeIndexRef.current, SLIDE);
  };

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
        <View
          style={styles.row}
          onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
        >
          {slotWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.lozengeWrap,
                { width: slotWidth - 10 },
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

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params as never);
              }
            };

            const icons = TABS[route.name];
            const iconColor = focused ? colors.accent : colors.textSecondary;
            const labelColor = focused ? colors.accentText : colors.textSecondary;
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                onPressIn={() => onTabPressIn(index)}
                onPressOut={onTabPressOut}
                style={styles.tab}
                android_ripple={{ color: 'transparent' }}
              >
                <Ionicons
                  name={focused ? icons.on : icons.off}
                  size={22}
                  color={iconColor}
                />
                <AppText
                  variant="caption"
                  color={labelColor}
                  style={focused ? styles.labelFocused : styles.label}
                >
                  {route.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </TabBarSurface>

      <FabButton
        onPress={() => {
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

function FabButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.fabSlot} hitSlop={6}>
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
    gap: 3,
  },
  label: { fontSize: 11, lineHeight: 13 },
  labelFocused: {
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'Inter_700Bold',
  },
  // The FAB floats over the pill's center, outside the clipped surface.
  fabSlot: {
    position: 'absolute',
    top: -layout.TAB_FAB_OVERLAP,
    alignSelf: 'center',
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

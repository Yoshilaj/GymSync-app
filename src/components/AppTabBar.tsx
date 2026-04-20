import { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';

const TABS: Record<
  string,
  { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }
> = {
  Plan: { on: 'calendar', off: 'calendar-outline' },
  Homie: { on: 'chatbubble-ellipses', off: 'chatbubble-ellipses-outline' },
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

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          height: 64 + Math.max(insets.bottom, 10),
        },
      ]}
    >
      <View style={styles.hairline} pointerEvents="none" />
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const isFab = route.name === FAB_ROUTE;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (isFab) {
            if (!event.defaultPrevented) {
              (navigation as any).navigate('Plan', {
                screen: 'LiveWorkoutStart',
                params: { workoutId: 'w-push' },
              });
            }
            return;
          }
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params as never);
          }
        };

        if (isFab) {
          return <FabSlot key={route.key} onPress={onPress} />;
        }

        const icons = TABS[route.name];
        const color = focused ? colors.accent : colors.textMuted;
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={styles.tab}
            android_ripple={{ color: 'transparent' }}
          >
            <Ionicons
              name={focused ? icons.on : icons.off}
              size={22}
              color={color}
            />
            <Text
              style={[
                styles.label,
                { color, fontWeight: focused ? '700' : '600' },
              ]}
            >
              {route.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FabSlot({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.fabSlot}>
      <View style={styles.fabShadow}>
        <LinearGradient
          colors={['#4FB0FF', '#2E90EA', '#1A6BC0']}
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
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    paddingTop: 8,
    alignItems: 'flex-start',
  },
  hairline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 4,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  fabShadow: {
    marginTop: -26,
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    borderRadius: 32,
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
});

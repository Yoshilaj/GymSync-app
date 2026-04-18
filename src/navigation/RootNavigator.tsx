import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { HomieStack } from './HomieStack';
import { ExerciseStack } from './ExerciseStack';
import { PlanStack } from './PlanStack';
import { ProgressStack } from './ProgressStack';
import { SettingsStack } from './SettingsStack';
import { colors } from '@/theme';

const Tab = createBottomTabNavigator();

export function RootNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 86,
          paddingTop: 8,
          paddingBottom: 28,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, focused }) => {
          const map: Record<string, { on: any; off: any }> = {
            Homie: { on: 'chatbubble-ellipses', off: 'chatbubble-ellipses-outline' },
            Exercise: { on: 'play-circle', off: 'play-circle-outline' },
            Plan: { on: 'calendar', off: 'calendar-outline' },
            Progress: { on: 'stats-chart', off: 'stats-chart-outline' },
            Settings: { on: 'settings', off: 'settings-outline' },
          };
          const icon = map[route.name];
          return (
            <Ionicons
              name={focused ? icon.on : icon.off}
              size={24}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Homie" component={HomieStack} />
      <Tab.Screen name="Exercise" component={ExerciseStack} />
      <Tab.Screen name="Plan" component={PlanStack} />
      <Tab.Screen name="Progress" component={ProgressStack} />
      <Tab.Screen name="Settings" component={SettingsStack} />
    </Tab.Navigator>
  );
}

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SyncStack } from './SyncStack';
import { PlanStack } from './PlanStack';
import { ProgressStack } from './ProgressStack';
import { AppTabBar } from '@/components/AppTabBar';

const Tab = createBottomTabNavigator();

export function RootNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Plan"
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Plan" component={PlanStack} />
      <Tab.Screen name="Sync" component={SyncStack} />
      <Tab.Screen name="Progress" component={ProgressStack} />
    </Tab.Navigator>
  );
}

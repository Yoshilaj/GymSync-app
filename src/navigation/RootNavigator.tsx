import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { SyncStack } from './SyncStack';
import { PlanStack } from './PlanStack';
import { ProgressStack } from './ProgressStack';
import { AppTabBar } from '@/components/AppTabBar';
import { peekPlanKickoff } from '@/lib/planKickoff';

const Tab = createBottomTabNavigator();

function FabPlaceholder() {
  return <View />;
}

export function RootNavigator() {
  return (
    <Tab.Navigator
      // Fresh from onboarding: open on Sync, where the first-plan chat starts.
      initialRouteName={peekPlanKickoff() ? 'Sync' : 'Plan'}
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Plan" component={PlanStack} />
      <Tab.Screen name="Sync" component={SyncStack} />
      <Tab.Screen name="Progress" component={ProgressStack} />
      <Tab.Screen name="LiveWorkout" component={FabPlaceholder} />
    </Tab.Navigator>
  );
}

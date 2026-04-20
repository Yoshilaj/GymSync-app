import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlanScreen } from '@/screens/plan/PlanScreen';
import { WorkoutSessionScreen } from '@/screens/plan/WorkoutSessionScreen';
import { LiveWorkoutStartScreen } from '@/screens/plan/LiveWorkoutStartScreen';
import { colors } from '@/theme';

export type PlanStackParamList = {
  PlanHome: undefined;
  LiveWorkoutStart: { workoutId: string };
  WorkoutSession: { workoutId: string };
};

const Stack = createNativeStackNavigator<PlanStackParamList>();

export function PlanStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="PlanHome"
        component={PlanScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LiveWorkoutStart"
        component={LiveWorkoutStartScreen}
        options={{ headerShown: false, animation: 'fade' }}
      />
      <Stack.Screen
        name="WorkoutSession"
        component={WorkoutSessionScreen}
        options={{ title: 'Session' }}
      />
    </Stack.Navigator>
  );
}

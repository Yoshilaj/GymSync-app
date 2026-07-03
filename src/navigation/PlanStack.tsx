import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlanScreen } from '@/screens/plan/PlanScreen';
import { WorkoutSessionScreen } from '@/screens/plan/WorkoutSessionScreen';
import { LiveWorkoutStartScreen } from '@/screens/plan/LiveWorkoutStartScreen';
import { ExerciseDetailScreen } from '@/screens/exercises/ExerciseDetailScreen';
import { ExerciseListScreen } from '@/screens/exercises/ExerciseListScreen';
import { colors } from '@/theme';

export type PlanStackParamList = {
  PlanHome: undefined;
  LiveWorkoutStart: { workoutId: string };
  WorkoutSession: { workoutId: string };
  ExerciseDetail: { exerciseId: string };
  ExerciseList: { mode?: 'browse' };
};

const Stack = createNativeStackNavigator<PlanStackParamList>();

export function PlanStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="PlanHome" component={PlanScreen} />
      <Stack.Screen
        name="LiveWorkoutStart"
        component={LiveWorkoutStartScreen}
        options={{ animation: 'fade' }}
      />
      <Stack.Screen
        name="WorkoutSession"
        component={WorkoutSessionScreen}
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <Stack.Screen name="ExerciseList" component={ExerciseListScreen} />
    </Stack.Navigator>
  );
}

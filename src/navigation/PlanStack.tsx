import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlanScreen } from '@/screens/plan/PlanScreen';
import { WorkoutSessionScreen } from '@/screens/plan/WorkoutSessionScreen';
import { LiveWorkoutStartScreen } from '@/screens/plan/LiveWorkoutStartScreen';
import { ExerciseDetailScreen } from '@/screens/exercises/ExerciseDetailScreen';
import { ExerciseListScreen } from '@/screens/exercises/ExerciseListScreen';
import { useTheme } from '@/theme';

export type PlanStackParamList = {
  /** Params arrive only as the picker's return channel (add exercise). */
  PlanHome: { pickedExercise?: string; targetWorkoutId?: string } | undefined;
  /** `day` = the calendar day (YYYY-MM-DD, local) the user selected on the
   * Plan tab. A PAST day means retroactive logging — sets stamp that day, the
   * way the body-weight card already does. Omitted/today/future → now. */
  LiveWorkoutStart: { workoutId: string; day?: string };
  WorkoutSession: { workoutId: string; day?: string };
  ExerciseDetail: { exerciseId: string };
  ExerciseList: {
    mode?: 'browse' | 'picker';
    /** Overrides the header title — the add flow says "Add exercise". */
    title?: string;
    returnTo?: 'PlanHome';
    targetWorkoutId?: string;
    /** Catalog ids and lowercased names already in the target day. */
    existingKeys?: string[];
  };
};

const Stack = createNativeStackNavigator<PlanStackParamList>();

export function PlanStack() {
  const { colors } = useTheme();
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

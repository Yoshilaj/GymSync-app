import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProgressScreen } from '@/screens/progress/ProgressScreen';
import { DayDetailScreen } from '@/screens/progress/DayDetailScreen';
import { ExerciseListScreen } from '@/screens/exercises/ExerciseListScreen';
import { ExerciseDetailScreen } from '@/screens/exercises/ExerciseDetailScreen';
import { colors } from '@/theme';

export type ProgressStackParamList = {
  ProgressHome:
    | {
        pickedExercise?: string;
        returnKey?: 'strength' | 'volume';
      }
    | undefined;
  DayDetail: { iso: string };
  ExerciseList: {
    mode?: 'browse' | 'picker';
    returnKey?: 'strength' | 'volume';
  };
  ExerciseDetail: { exerciseId: string };
};

const Stack = createNativeStackNavigator<ProgressStackParamList>();

export function ProgressStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen name="ProgressHome" component={ProgressScreen} />
      <Stack.Screen name="DayDetail" component={DayDetailScreen} />
      <Stack.Screen name="ExerciseList" component={ExerciseListScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
    </Stack.Navigator>
  );
}

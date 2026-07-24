import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProgressScreen } from '@/screens/progress/ProgressScreen';
import { DayDetailScreen } from '@/screens/progress/DayDetailScreen';
import { ExerciseListScreen } from '@/screens/exercises/ExerciseListScreen';
import { ExerciseDetailScreen } from '@/screens/exercises/ExerciseDetailScreen';
import { SettingsScreen } from '@/screens/settings/SettingsScreen';
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
  Settings: undefined;
};

const Stack = createNativeStackNavigator<ProgressStackParamList>();

export function ProgressStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="ProgressHome" component={ProgressScreen} />
      <Stack.Screen name="DayDetail" component={DayDetailScreen} />
      <Stack.Screen name="ExerciseList" component={ExerciseListScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

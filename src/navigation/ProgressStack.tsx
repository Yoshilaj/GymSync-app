import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProgressScreen } from '@/screens/progress/ProgressScreen';
import { DayDetailScreen } from '@/screens/progress/DayDetailScreen';
import { ExerciseListScreen } from '@/screens/exercises/ExerciseListScreen';
import { ExerciseDetailScreen } from '@/screens/exercises/ExerciseDetailScreen';
import { SettingsNavigator } from '@/navigation/SettingsNavigator';
import { useTheme } from '@/theme';

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
    /** Optional header override; this tab keeps the default. */
    title?: string;
    returnKey?: 'strength' | 'volume';
  };
  ExerciseDetail: { exerciseId: string };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<ProgressStackParamList>();

export function ProgressStack() {
  const { colors } = useTheme();
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
      <Stack.Screen name="Settings" component={SettingsNavigator} />
    </Stack.Navigator>
  );
}

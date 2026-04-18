import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ExerciseLibraryScreen } from '@/screens/exercise/ExerciseLibraryScreen';
import { ExerciseDetailScreen } from '@/screens/exercise/ExerciseDetailScreen';
import { colors } from '@/theme';

export type ExerciseStackParamList = {
  ExerciseLibrary: undefined;
  ExerciseDetail: { exerciseId: string };
};

const Stack = createNativeStackNavigator<ExerciseStackParamList>();

export function ExerciseStack() {
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
        name="ExerciseLibrary"
        component={ExerciseLibraryScreen}
        options={{ title: 'Exercise Library' }}
      />
      <Stack.Screen
        name="ExerciseDetail"
        component={ExerciseDetailScreen}
        options={{ title: '' }}
      />
    </Stack.Navigator>
  );
}

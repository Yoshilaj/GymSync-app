import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProgressScreen } from '@/screens/progress/ProgressScreen';
import { colors } from '@/theme';

export type ProgressStackParamList = {
  ProgressHome: undefined;
};

const Stack = createNativeStackNavigator<ProgressStackParamList>();

export function ProgressStack() {
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
        name="ProgressHome"
        component={ProgressScreen}
        options={{ title: 'Progress' }}
      />
    </Stack.Navigator>
  );
}

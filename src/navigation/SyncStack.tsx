import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SyncChatScreen } from '@/screens/sync/SyncChatScreen';
import { VoiceDevScreen } from '@/screens/sync/VoiceDevScreen';
import { useTheme } from '@/theme';

export type SyncStackParamList = {
  SyncHome: undefined;
  VoiceDev: undefined;
};

const Stack = createNativeStackNavigator<SyncStackParamList>();

export function SyncStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="SyncHome" component={SyncChatScreen} />
      {__DEV__ && (
        <Stack.Screen
          name="VoiceDev"
          component={VoiceDevScreen}
          options={{
            headerShown: true,
            title: 'Voice Dev',
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.textPrimary,
          }}
        />
      )}
    </Stack.Navigator>
  );
}

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SyncChatScreen } from '@/screens/sync/SyncChatScreen';
import { VoiceCoachScreen } from '@/screens/sync/VoiceCoachScreen';
import { VoiceDevScreen } from '@/screens/sync/VoiceDevScreen';
import { colors } from '@/theme';

export type SyncStackParamList = {
  SyncHome: undefined;
  VoiceCoach: undefined;
  VoiceDev: undefined;
};

const Stack = createNativeStackNavigator<SyncStackParamList>();

export function SyncStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="SyncHome" component={SyncChatScreen} />
      <Stack.Screen
        name="VoiceCoach"
        component={VoiceCoachScreen}
        options={{ presentation: 'modal' }}
      />
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

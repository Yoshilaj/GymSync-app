import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SyncScreen } from '@/screens/sync/SyncScreen';
import { ConversationScreen } from '@/screens/sync/ConversationScreen';
import { VoiceCoachScreen } from '@/screens/sync/VoiceCoachScreen';
import { colors } from '@/theme';

export type SyncStackParamList = {
  SyncHome: undefined;
  SyncConversation: { draft?: string } | undefined;
  VoiceCoach: undefined;
};

const Stack = createNativeStackNavigator<SyncStackParamList>();

export function SyncStack() {
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
        name="SyncHome"
        component={SyncScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SyncConversation"
        component={ConversationScreen}
        options={{ title: 'Sync' }}
      />
      <Stack.Screen
        name="VoiceCoach"
        component={VoiceCoachScreen}
        options={{ title: 'Voice Coach', presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

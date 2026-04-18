import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomieScreen } from '@/screens/homie/HomieScreen';
import { ConversationScreen } from '@/screens/homie/ConversationScreen';
import { VoiceCoachScreen } from '@/screens/homie/VoiceCoachScreen';
import { colors } from '@/theme';

export type HomieStackParamList = {
  HomieHome: undefined;
  HomieConversation: { draft?: string } | undefined;
  VoiceCoach: undefined;
};

const Stack = createNativeStackNavigator<HomieStackParamList>();

export function HomieStack() {
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
        name="HomieHome"
        component={HomieScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="HomieConversation"
        component={ConversationScreen}
        options={{ title: 'Homie' }}
      />
      <Stack.Screen
        name="VoiceCoach"
        component={VoiceCoachScreen}
        options={{ title: 'Voice Coach', presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { RootNavigator } from '@/navigation/RootNavigator';
import { AuthNavigator } from '@/navigation/AuthNavigator';
import { OnboardingNavigator } from '@/navigation/OnboardingNavigator';
import { UserProvider, useUser } from '@/context/UserContext';
import { PlanProvider } from '@/context/PlanContext';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { colors } from '@/theme';

const navTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.card,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.accent,
  },
};

function Splash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

/**
 * Auth + first-run gate: splash while loading, auth flow when logged out,
 * onboarding until the profile has onboarded_at, then the app. If the profile
 * can't be fetched at all (offline, server down) we fail OPEN into the app —
 * never lock a user out over a flag lookup.
 */
function RootGate() {
  const { loading, session } = useAuth();
  const { profile, profileStatus } = useUser();

  if (loading || (session && profileStatus === 'loading')) {
    return <Splash />;
  }

  const needsOnboarding =
    !!session && profileStatus === 'ready' && !profile?.onboarded_at;

  return (
    <NavigationContainer theme={navTheme}>
      {!session ? (
        <AuthNavigator />
      ) : needsOnboarding ? (
        <OnboardingNavigator />
      ) : (
        <RootNavigator />
      )}
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  return (
    <GestureHandlerRootView style={styles.flex}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <AuthProvider>
            <UserProvider>
              <PlanProvider>
                <StatusBar style="dark" />
                {fontsLoaded ? <RootGate /> : <Splash />}
              </PlanProvider>
            </UserProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});

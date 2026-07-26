import 'react-native-gesture-handler';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Alert, Linking, View, ActivityIndicator, StyleSheet } from 'react-native';
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
import { ThemeProvider, useTheme, useThemePref, type ThemePreference } from '@/theme';

function Splash() {
  const { colors } = useTheme();
  return (
    <View style={[styles.splash, { backgroundColor: colors.bg }]}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

/**
 * Adopt the theme preference stored on the server profile once, when it
 * hydrates — so the choice syncs across devices. A local in-session change
 * (which also persists) wins because we only adopt one time per app run.
 */
function useAdoptServerTheme() {
  const { profile } = useUser();
  const { setThemePreference } = useThemePref();
  const adopted = useRef(false);
  const serverTheme = profile?.preferences?.theme as ThemePreference | undefined;
  useEffect(() => {
    if (adopted.current) return;
    if (serverTheme === 'light' || serverTheme === 'dark' || serverTheme === 'system') {
      adopted.current = true;
      setThemePreference(serverTheme);
    }
  }, [serverTheme, setThemePreference]);
}

/**
 * Supabase email links (change-email / reset confirmations) redirect to
 * gymsync://auth-callback — the verification already happened server-side by
 * the time the app opens, so just acknowledge it.
 */
function useAuthDeepLinks() {
  useEffect(() => {
    const handle = (url: string | null) => {
      if (url?.startsWith('gymsync://auth-callback')) {
        Alert.alert('Confirmed', 'Your change has been confirmed.');
      }
    };
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    void Linking.getInitialURL().then(handle);
    return () => sub.remove();
  }, []);
}

/**
 * Auth + first-run gate: splash while loading, auth flow when logged out,
 * onboarding until the profile has onboarded_at, then the app. Fails OPEN
 * into the app if the profile can't be fetched (never lock a user out).
 */
function RootGate() {
  useAuthDeepLinks();
  const { loading, session } = useAuth();
  const { profile, profileStatus } = useUser();
  const { colors, scheme } = useTheme();
  useAdoptServerTheme();

  const navTheme = {
    ...DefaultTheme,
    dark: scheme === 'dark',
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

  const content = () => {
    if (loading || (session && profileStatus === 'loading')) return <Splash />;
    const needsOnboarding =
      !!session && profileStatus === 'ready' && !profile?.onboarded_at;
    if (!session) return <AuthNavigator />;
    if (needsOnboarding) return <OnboardingNavigator />;
    return <RootNavigator />;
  };

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <NavigationContainer theme={navTheme}>{content()}</NavigationContainer>
    </>
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
              <ThemeProvider>
                <PlanProvider>
                  {fontsLoaded ? <RootGate /> : <Splash />}
                </PlanProvider>
              </ThemeProvider>
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
  },
});

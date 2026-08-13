import 'react-native-gesture-handler';
import * as Sentry from '@sentry/react-native';
import { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
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
import { ResetPasswordScreen } from '@/screens/auth/ResetPasswordScreen';
import { TwoFactorChallengeScreen } from '@/screens/auth/TwoFactorChallengeScreen';
import { UserProvider, useUser } from '@/context/UserContext';
import { PlanProvider } from '@/context/PlanContext';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { BillingProvider } from '@/billing/BillingProvider';
import { LaunchScreen } from '@/components/LaunchScreen';
import { readPendingStash, type PendingStash } from '@/screens/onboarding/draftStash';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConfigErrorScreen } from '@/components/ConfigErrorScreen';
import { missingConfig } from '@/config/preflight';
import { useOutboxSync } from '@/lib/useOutboxSync';
import { ThemeProvider, useTheme, useThemePref, type ThemePreference } from '@/theme';

/**
 * Crash reporting. Until now a render throw was a white screen nobody could
 * recover from and nobody heard about; ErrorBoundary fixes the first half, this
 * fixes the second.
 *
 * Off unless a DSN is configured, and off in development — a dev session
 * generates exactly the noise that makes a production issue feed useless, and
 * the red box already reports those to the person who caused them.
 *
 * Sentry installs its own global error and unhandled-rejection handlers here, so
 * failures outside React's render tree (a rejected promise in a hook, a socket
 * callback) are captured too. Don't call ErrorUtils.setGlobalHandler elsewhere
 * without chaining to the previous handler — it would silently unhook these.
 */
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN && !__DEV__,
  // Errors only for now. Tracing on a voice app samples the hot path and costs
  // quota we'd rather spend on crashes; turn it on deliberately, with a rate.
  tracesSampleRate: 0,
  // The user id is set by AuthContext; nothing here should carry a token, an
  // email, or anything typed into the coach.
  sendDefaultPii: false,
});

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
 * Onboarding now runs pre-auth, so a fresh signup arrives with its answers
 * stashed on disk. This resolves that stash once per account: keyed on the
 * user id (NOT the session object, which changes identity on every token
 * refresh) so the read doesn't re-fire and flicker the gate.
 */
type DraftGate =
  | { state: 'idle' | 'loading' }
  | { state: 'resolved'; stash: PendingStash | null };

function usePendingOnboardingDraft(userId: string | null): DraftGate {
  const [gate, setGate] = useState<DraftGate>({ state: 'idle' });
  useEffect(() => {
    if (!userId) {
      setGate({ state: 'idle' });
      return;
    }
    let cancelled = false;
    setGate({ state: 'loading' });
    void readPendingStash().then((stash) => {
      if (!cancelled) setGate({ state: 'resolved', stash });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return gate;
}

/**
 * Auth + first-run gate: splash while loading, auth flow when logged out,
 * onboarding until the profile has onboarded_at, then the app. Fails OPEN
 * into the app if the profile can't be fetched (never lock a user out) — a
 * stashed onboarding draft survives that and is picked up on a later launch.
 */
function RootGate() {
  const { loading, session, recoveryMode, twoFactorPending } = useAuth();
  const { profile, profileStatus } = useUser();
  const { colors, scheme } = useTheme();
  const draftGate = usePendingOnboardingDraft(session?.user?.id ?? null);
  useAdoptServerTheme();
  // Flush queued offline writes (sets, session ends, body weight) whenever
  // the app foregrounds or connectivity returns — see lib/outbox.ts.
  useOutboxSync();

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
    // Two branches that both sit on top of a real session, in this order.
    //
    // 2FA first, and that ordering is load-bearing: someone with 2FA on who
    // forgets their password opens a reset link, which mints an aal1 session.
    // Reset-first would let them past the factor; factor-first means they clear
    // it, twoFactorPending drops, and the very next render is the reset screen.
    // Composing rather than special-casing is why this is two ifs and not four.
    if (twoFactorPending) return <TwoFactorChallengeScreen />;
    // Recovery outranks everything below, including `loading`. A reset link
    // carries a real session, so any branch below would let the user straight
    // into the app with their old password still working.
    if (recoveryMode) return <ResetPasswordScreen />;
    // The draft read resolves faster than the profile GET, so waiting on both
    // adds no visible latency — and prevents a one-frame flash of the wrong
    // branch (questions vs BuildingPlan) before the stash is known.
    if (
      loading ||
      (session && (profileStatus === 'loading' || draftGate.state !== 'resolved'))
    ) {
      return <LaunchScreen />;
    }
    const needsOnboarding =
      !!session && profileStatus === 'ready' && !profile?.onboarded_at;
    if (!session) return <AuthNavigator />;
    if (needsOnboarding) {
      const pending = draftGate.state === 'resolved' ? draftGate.stash : null;
      // With a stashed pre-auth draft: straight to BuildingPlan, which PUTs
      // the answers then adopts the already-shown plan (or generates if none
      // survived). Without one (legacy accounts): the post-auth question
      // flow, exactly as before.
      return pending ? (
        <OnboardingNavigator resumeDraft={pending.draft} resumePlan={pending.plan} />
      ) : (
        <OnboardingNavigator />
      );
    }
    return <RootNavigator />;
  };

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <NavigationContainer theme={navTheme}>
        {/* Inner boundary: one screen throwing shouldn't take the shell with
            it. Remounting from here re-runs that screen's fetches and leaves
            the session, the navigator and the providers alone. */}
        <ErrorBoundary scope="navigation">{content()}</ErrorBoundary>
      </NavigationContainer>
    </>
  );
}

function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // A release build missing its baked-in env can't do anything useful — but it
  // CAN say so. Checked before the provider tree because the providers are
  // exactly what a missing config breaks. Dev keeps the sign-in screen +
  // console warning; see src/config/preflight.ts for the full story.
  if (!__DEV__ && missingConfig.length > 0) {
    return <ConfigErrorScreen missing={missingConfig} />;
  }

  return (
    // Outermost, and outside every provider on purpose: PlanContext,
    // UserContext and BillingProvider each throw when consumed out of order,
    // and a boundary nested inside them can't catch the stack it lives in.
    <ErrorBoundary scope="root">
      <GestureHandlerRootView style={styles.flex}>
        <KeyboardProvider>
          <SafeAreaProvider>
            <AuthProvider>
              <UserProvider>
                <ThemeProvider>
                  <PlanProvider>
                    {/* Inside AuthProvider because it needs the token, and
                        mounted exactly once: useIAP opens a native StoreKit
                        connection and registers transaction listeners, so a
                        second instance would deliver every purchase twice. */}
                    <BillingProvider>
                      {/* A font failure falls through to the system face —
                          degraded typography beats an eternal splash. The
                          error slot used to be discarded, which made any
                          font-load failure an unrecoverable blue screen. */}
                      {fontsLoaded || fontError ? (
                        <RootGate />
                      ) : (
                        <LaunchScreen showWordmark={false} />
                      )}
                    </BillingProvider>
                  </PlanProvider>
                </ThemeProvider>
              </UserProvider>
            </AuthProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

// Sentry.wrap is what attaches the native crash handlers to the running app —
// init alone doesn't, and a JS-only setup silently misses native crashes.
export default Sentry.wrap(App);

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

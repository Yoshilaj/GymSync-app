import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WelcomeScreen } from '@/screens/auth/WelcomeScreen';
import { IntroScreen } from '@/screens/auth/IntroScreen';
import { SignInScreen } from '@/screens/auth/SignInScreen';
import { SignUpScreen } from '@/screens/auth/SignUpScreen';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { OnboardingNavigator } from '@/navigation/OnboardingNavigator';
import { useTheme } from '@/theme';

export type AuthStackParamList = {
  Welcome: undefined;
  Intro: undefined;
  /** The pre-auth onboarding questions — a nested stack of its own. */
  Onboarding: undefined;
  SignIn: undefined;
  SignUp: undefined;
  ForgotPassword: { email?: string } | undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

/** Pre-auth onboarding: the question flow nested as one auth-stack screen. */
function PreAuthOnboarding() {
  return <OnboardingNavigator preAuth />;
}

/** Logged-out flow: pitch, onboarding, account creation, sign-in, reset. */
export function AuthNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Intro" component={IntroScreen} />
      <Stack.Screen name="Onboarding" component={PreAuthOnboarding} />
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Button, Input } from '@/components/ui';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { OrDivider, SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { useAuth } from '@/auth/AuthContext';
import { AuthStackParamList } from '@/navigation/AuthNavigator';

/** Email/password sign-in — the auth stack's landing screen. */
export function SignInScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { signIn } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) setError(err);
  };

  return (
    <AuthLayout caption="Welcome back — let's get to work">
      <View style={styles.form}>
        <Input
          label="Email"
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Input
          ref={passwordRef}
          label="Password"
          icon="lock-closed-outline"
          secure
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />

        <Pressable
          onPress={() =>
            navigation.navigate('ForgotPassword', { email: email.trim() || undefined })
          }
          hitSlop={8}
          style={styles.forgot}
        >
          <AppText variant="caption" color="accentText">
            Forgot password?
          </AppText>
        </Pressable>

        {error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={15} color={colors.dangerText} />
            <AppText variant="caption" color="dangerText" style={{ flex: 1 }}>
              {error}
            </AppText>
          </View>
        ) : null}

        <Button
          title="Sign in"
          icon="log-in"
          loading={submitting}
          disabled={submitting}
          onPress={onSubmit}
          style={styles.button}
        />
      </View>

      <OrDivider />
      <SocialAuthButtons />

      <View style={styles.footer}>
        <AppText variant="caption">New to GymSync?</AppText>
        <Pressable onPress={() => navigation.navigate('SignUp')} hitSlop={8}>
          <AppText variant="caption" color="accentText" style={styles.footerLink}>
            Create account
          </AppText>
        </Pressable>
      </View>
    </AuthLayout>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: spacing.md },
  forgot: { alignSelf: 'flex-end' },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: t.colors.dangerSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  button: { marginTop: spacing.xs },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  footerLink: { fontFamily: 'Inter_600SemiBold' },
}));

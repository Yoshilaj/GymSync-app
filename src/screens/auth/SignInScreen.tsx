import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { makeStyles, spacing } from '@/theme';
import { AppText, Button, Input } from '@/components/ui';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormError } from '@/components/auth/FormKit';
import { hasSocialAuth, OrDivider, SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { useAuth } from '@/auth/AuthContext';
import { AuthStackParamList } from '@/navigation/AuthNavigator';

/** Email/password sign-in — reached from the Welcome screen's Log in. */
export function SignInScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { signIn } = useAuth();
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
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in and pick up where you left off."
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
    >
      <View style={styles.form}>
        <Input
          round
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          accessibilityLabel="Email address"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Input
          round
          ref={passwordRef}
          icon="lock-closed-outline"
          secure
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          accessibilityLabel="Password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />
      </View>

      <Pressable
        onPress={() =>
          navigation.navigate('ForgotPassword', { email: email.trim() || undefined })
        }
        hitSlop={8}
        accessibilityRole="button"
        style={styles.forgot}
      >
        <AppText variant="caption" color="accentText">
          Forgot password?
        </AppText>
      </Pressable>

      {error ? (
        <View style={styles.error}>
          <FormError message={error} />
        </View>
      ) : null}

      <Button
        title="Sign in"
        pill
        loading={submitting}
        disabled={submitting}
        onPress={onSubmit}
        style={styles.submit}
      />

      {/* Both vanish together when no provider is available in this build —
          an "or" rule with nothing under it reads as a broken screen. */}
      {hasSocialAuth && (
        <>
          <OrDivider />
          <SocialAuthButtons />
        </>
      )}

      <View style={styles.footer}>
        <AppText variant="caption">New to GymSync?</AppText>
        <Pressable
          onPress={() => navigation.navigate('Intro')}
          hitSlop={8}
          accessibilityRole="button"
        >
          <AppText variant="caption" color="accentText" style={styles.footerLink}>
            Get started
          </AppText>
        </Pressable>
      </View>
    </AuthLayout>
  );
}

// One rhythm: lg (16) inside a block, xl (24) between blocks — sized so the
// whole sheet fits one screen without scrolling.
const useStyles = makeStyles(() => ({
  form: { gap: spacing.lg },
  // Sits tight under the field it belongs to, not floating between blocks.
  forgot: { alignSelf: 'flex-end', marginTop: spacing.md, minHeight: 32 },
  error: { marginTop: spacing.lg },
  submit: { marginTop: spacing.xl },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  footerLink: { fontFamily: 'Inter_600SemiBold' },
}));

import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Button, Input } from '@/components/ui';
import { PasswordStrength } from '@/components/PasswordStrength';
import { checkPassword } from '@/lib/passwordStrength';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormError } from '@/components/auth/FormKit';
import { hasSocialAuth, OrDivider, SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { useAuth } from '@/auth/AuthContext';
import { AuthStackParamList } from '@/navigation/AuthNavigator';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Account creation — now the step AFTER onboarding, so the user arrives with
 * their answers stashed and a coach already matched. The copy sells saving
 * that work, and the "Sign in" footer navigates explicitly (goBack would land
 * on the last onboarding question). Shows a "check your inbox" state when
 * Supabase requires email confirmation; the stashed draft waits on disk.
 */
export function SignUpScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { signUp } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // The strength meter only exists while the field is focused, so the resting
  // sheet keeps its one-screen budget.
  const [passwordFocused, setPasswordFocused] = useState(false);

  const onSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    // Same rules the meter shows live, and the same ones the server enforces.
    const strength = checkPassword(password, { email: trimmedEmail, name });
    if (!strength.meetsMinimum) {
      setError(strength.hint ?? 'Please choose a stronger password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err, needsConfirmation } = await signUp(
      trimmedEmail,
      password,
      name.trim() || undefined,
    );
    setSubmitting(false);
    if (err) setError(err);
    else if (needsConfirmation) setSentTo(trimmedEmail);
    // Otherwise a session was set and the auth gate flips into the app.
  };

  if (sentTo) {
    return (
      <AuthLayout title="Check your inbox" subtitle="One more step.">
        <View style={styles.confirmBlock}>
          <View style={styles.confirmIcon}>
            <Ionicons name="mail-unread-outline" size={28} color={colors.accentText} />
          </View>
          <AppText variant="body" align="center">
            We sent a confirmation link to{'\n'}
            <AppText variant="bodyMedium">{sentTo}</AppText>
          </AppText>
          <AppText variant="caption" align="center" color="textSecondary">
            Tap the link in the email, then come back and sign in. Your answers
            are saved on this device.
          </AppText>
          <Button
            title="Back to sign in"
            variant="ghost"
            onPress={() => navigation.navigate('SignIn')}
            style={styles.confirmButton}
          />
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Save your plan"
      subtitle="Create an account to keep your plan."
      onBack={() => navigation.goBack()}
    >
      <View style={styles.form}>
        <Input
          round
          icon="person-outline"
          value={name}
          onChangeText={setName}
          placeholder="What should your coach call you?"
          accessibilityLabel="Name"
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <Input
          round
          ref={emailRef}
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
        <View>
          <Input
            round
            ref={passwordRef}
            icon="lock-closed-outline"
            secure
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            accessibilityLabel="Password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
          />
          {passwordFocused ? (
            <PasswordStrength
              value={password}
              visible
              context={{ email, name }}
              style={styles.hint}
            />
          ) : (
            <AppText variant="caption" color="textTertiary" style={styles.hint}>
              At least 8 characters.
            </AppText>
          )}
        </View>
      </View>

      {error ? (
        <View style={styles.error}>
          <FormError message={error} />
        </View>
      ) : null}

      <Button
        title="Create account"
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

      <AppText variant="caption" color="textTertiary" align="center" style={styles.legal}>
        By continuing you agree to the Terms of Service and Privacy Policy.
      </AppText>

      <View style={styles.footer}>
        <AppText variant="caption">Already have an account?</AppText>
        <Pressable
          // Explicit navigate: goBack here would return to the last
          // onboarding question, not a sign-in form.
          onPress={() => navigation.navigate('SignIn')}
          hitSlop={8}
          accessibilityRole="button"
        >
          <AppText variant="caption" color="accentText" style={styles.footerLink}>
            Sign in
          </AppText>
        </Pressable>
      </View>
    </AuthLayout>
  );
}

// One rhythm: lg (16) inside a block, xl (24) between blocks — sized so the
// whole sheet fits one screen without scrolling.
const useStyles = makeStyles((t) => ({
  form: { gap: spacing.lg },
  // Indented to the round field's inner text edge, not the sheet edge.
  hint: { marginTop: spacing.sm, marginLeft: spacing.lg },
  error: { marginTop: spacing.lg },
  submit: { marginTop: spacing.xl },
  legal: { marginTop: spacing.lg },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  footerLink: { fontFamily: 'Inter_600SemiBold' },
  confirmBlock: { alignItems: 'center', gap: spacing.md },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: t.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  confirmButton: { marginTop: spacing.md },
}));

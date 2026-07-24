import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radius, spacing } from '@/theme';
import { AppText, Button, Input } from '@/components/ui';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { OrDivider, SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { useAuth } from '@/auth/AuthContext';
import { AuthStackParamList } from '@/navigation/AuthNavigator';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Account creation. Shows a "check your inbox" state when Supabase requires email confirmation. */
export function SignUpScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { signUp } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const onSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
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
      <AuthLayout title="Check your inbox" caption="One more step">
        <View style={styles.confirmBlock}>
          <View style={styles.confirmIcon}>
            <Ionicons name="mail-unread-outline" size={28} color={colors.accentText} />
          </View>
          <AppText variant="body" align="center">
            We sent a confirmation link to{'\n'}
            <AppText variant="bodyMedium">{sentTo}</AppText>
          </AppText>
          <AppText variant="caption" align="center" color="textSecondary">
            Tap the link in the email, then come back and sign in.
          </AppText>
          <Button
            title="Back to sign in"
            variant="ghost"
            onPress={() => navigation.popToTop()}
            style={styles.confirmButton}
          />
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      caption="Create your account"
      onBack={() => navigation.goBack()}
    >
      <View style={styles.form}>
        <Input
          label="Name"
          icon="person-outline"
          value={name}
          onChangeText={setName}
          placeholder="What should your coach call you?"
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <Input
          ref={emailRef}
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
        <View>
          <Input
            ref={passwordRef}
            label="Password"
            icon="lock-closed-outline"
            secure
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
          <AppText variant="caption" color="textTertiary" style={styles.hint}>
            At least 8 characters
          </AppText>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={15} color={colors.dangerText} />
            <AppText variant="caption" color="dangerText" style={{ flex: 1 }}>
              {error}
            </AppText>
          </View>
        ) : null}

        <Button
          title="Create account"
          icon="person-add"
          loading={submitting}
          disabled={submitting}
          onPress={onSubmit}
        />
      </View>

      <OrDivider />
      <SocialAuthButtons />

      <AppText variant="caption" color="textTertiary" align="center" style={styles.legal}>
        By continuing you agree to the Terms of Service and Privacy Policy.
      </AppText>

      <View style={styles.footer}>
        <AppText variant="caption">Already have an account?</AppText>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <AppText variant="caption" color="accentText" style={styles.footerLink}>
            Sign in
          </AppText>
        </Pressable>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  hint: { marginTop: spacing.xs },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  legal: { marginTop: spacing.lg },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  footerLink: { fontFamily: 'Inter_600SemiBold' },
  confirmBlock: { alignItems: 'center', gap: spacing.md },
  confirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  confirmButton: { marginTop: spacing.md },
});

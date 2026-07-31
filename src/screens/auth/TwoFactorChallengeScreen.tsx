import { useState } from 'react';
import { View } from 'react-native';
import { makeStyles, spacing } from '@/theme';
import { AppText, Button, Input } from '@/components/ui';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormError } from '@/components/auth/FormKit';
import { useAuth } from '@/auth/AuthContext';

const CODE_LENGTH = 6;

/**
 * The second step of signing in, for accounts with 2FA on.
 *
 * Rendered by RootGate rather than pushed onto the auth stack, because by this
 * point the user already HAS a session — just an aal1 one. Every other branch of
 * the gate would happily show them the app.
 */
export function TwoFactorChallengeScreen() {
  const { submitTwoFactor, signOut, user } = useAuth();
  const styles = useStyles();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string) => {
    setSubmitting(true);
    setError(null);
    const { error: err } = await submitTwoFactor(value);
    setSubmitting(false);
    if (err) {
      setError(err);
      setCode('');
    }
    // On success the session becomes aal2 and the gate moves on by itself.
  };

  const onChange = (next: string) => {
    const digits = next.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (error) setError(null);
    // Six digits is the whole code — asking for a button press after that is
    // just a second thing to tap.
    if (digits.length === CODE_LENGTH && !submitting) void submit(digits);
  };

  return (
    <AuthLayout
      title="Enter your code"
      subtitle={
        user?.email
          ? `Open your authenticator app for the 6-digit code.`
          : 'Open your authenticator app.'
      }
    >
      <Input
        round
        icon="shield-checkmark-outline"
        value={code}
        onChangeText={onChange}
        placeholder="000000"
        accessibilityLabel="Six-digit authentication code"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        editable={!submitting}
        autoFocus
      />

      <AppText variant="caption" color="textTertiary" style={styles.hint}>
        Codes refresh every 30 seconds.
      </AppText>

      {error ? (
        <View style={styles.error}>
          <FormError message={error} />
        </View>
      ) : null}

      <Button
        title="Verify"
        pill
        loading={submitting}
        disabled={submitting || code.length < CODE_LENGTH}
        onPress={() => void submit(code)}
        style={styles.submit}
      />

      {/* The only way out. Without it, someone who's lost their authenticator is
          stuck on this screen with no route back to a sign-in form. */}
      <Button
        title="Sign in with a different account"
        variant="ghost"
        onPress={() => void signOut()}
        style={styles.cancel}
      />
    </AuthLayout>
  );
}

const useStyles = makeStyles(() => ({
  hint: { marginTop: spacing.sm, marginLeft: spacing.lg },
  error: { marginTop: spacing.lg },
  submit: { marginTop: spacing.xl },
  cancel: { marginTop: spacing.sm },
}));

import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Button, Input } from '@/components/ui';
import { PasswordStrength } from '@/components/PasswordStrength';
import { checkPassword } from '@/lib/passwordStrength';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { FormError } from '@/components/auth/FormKit';
import { useAuth } from '@/auth/AuthContext';

/**
 * The end of a password reset — reached only by opening the emailed link, which
 * puts the app into recovery mode (see AuthContext). Before this existed the
 * reset dead-ended on Supabase's own hosted web page.
 *
 * Rendered by RootGate rather than a navigator: recovery mode has to outrank
 * every other branch (a recovery session is a real session, so the normal gate
 * would happily drop the user into the app), and there is nowhere to navigate
 * back to.
 */
export function ResetPasswordScreen() {
  const { completeRecovery, cancelRecovery, user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const confirmRef = useRef<TextInput>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = checkPassword(password, { email: user?.email ?? undefined });

  const onSubmit = async () => {
    if (!strength.meetsMinimum) {
      setError(strength.hint ?? 'Please choose a stronger password.');
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    // The server has the last word on the rules — the meter above is a preview.
    const { error: err } = await completeRecovery(password);
    setSubmitting(false);
    if (err) setError(err);
    else setDone(true);
  };

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="You're all set.">
        <View style={styles.doneBlock}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark-circle-outline" size={28} color={colors.successText} />
          </View>
          <AppText variant="body" align="center">
            Sign in with your new password.
          </AppText>
          {/* completeRecovery already dropped the recovery session; this just
              returns to the sign-in screen. */}
          <Button title="Sign in" pill onPress={() => void cancelRecovery()} style={styles.doneButton} />
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle={user?.email ? `For ${user.email}` : 'Choose something you can remember.'}
    >
      <View style={styles.form}>
        <View>
          <Input
            round
            icon="lock-closed-outline"
            secure
            value={password}
            onChangeText={setPassword}
            placeholder="New password"
            accessibilityLabel="New password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus
          />
          {focused ? (
            <PasswordStrength
              value={password}
              visible
              context={{ email: user?.email ?? undefined }}
              style={styles.hint}
            />
          ) : (
            <AppText variant="caption" color="textTertiary" style={styles.hint}>
              At least 8 characters.
            </AppText>
          )}
        </View>
        <Input
          round
          ref={confirmRef}
          icon="lock-closed-outline"
          secure
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm new password"
          accessibilityLabel="Confirm new password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          error={confirm.length > 0 && confirm !== password}
        />
      </View>

      {error ? (
        <View style={styles.error}>
          <FormError message={error} />
        </View>
      ) : null}

      <Button
        title="Update password"
        pill
        loading={submitting}
        disabled={submitting}
        onPress={onSubmit}
        style={styles.submit}
      />

      <Button
        title="Cancel"
        variant="ghost"
        onPress={() => void cancelRecovery()}
        style={styles.cancel}
      />
    </AuthLayout>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: spacing.lg },
  hint: { marginTop: spacing.sm, marginLeft: spacing.lg },
  error: { marginTop: spacing.lg },
  submit: { marginTop: spacing.xl },
  cancel: { marginTop: spacing.sm },
  doneBlock: { alignItems: 'center', gap: spacing.md },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: t.colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  doneButton: { marginTop: spacing.md, alignSelf: 'stretch' },
}));

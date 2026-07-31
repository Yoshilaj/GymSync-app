import { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { makeStyles, spacing } from '@/theme';
import { AppText, Button, Input } from '@/components/ui';
import { PasswordStrength } from '@/components/PasswordStrength';
import { checkPassword } from '@/lib/passwordStrength';
import { useAuth } from '@/auth/AuthContext';
import { changePassword } from '@/api/auth';
import { supabase } from '@/auth/supabase';
import { SettingsPage } from './SettingsKit';

/**
 * Change the password — or, for an account that hasn't got one, set the first.
 *
 * The second case is not hypothetical: an account created with Apple or Google
 * has no password identity at all. This screen used to show the same
 * current-password form to everyone, so those users typed something, the server
 * checked it with `sign_in_with_password` against an account that has no
 * password, and told them it was incorrect. True, and useless.
 *
 * Setting a first password goes through the emailed reset link rather than
 * happening inline. That isn't caution for its own sake: allowing a password to
 * be set from nothing more than a live session would mean a borrowed unlocked
 * phone could mint permanent credentials for someone else's account. Proving you
 * own the inbox costs one tap and closes that.
 */
export function ChangePasswordScreen() {
  const styles = useStyles();
  const nav = useNavigation();
  const { user, getToken, hasPassword, resetPassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Popping straight back read as "nothing happened" — the change is
  // invisible by nature, so it has to be stated.
  const [done, setDone] = useState(false);
  const [nextFocused, setNextFocused] = useState(false);

  // The current password only has to be present — the server re-auth decides
  // whether it's right, and an existing password may predate today's rules.
  // The NEW one gets the full check, same as sign-up.
  const strength = checkPassword(next, { email: user?.email ?? undefined });
  const valid = current.length > 0 && strength.meetsMinimum && next === confirm;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      // Through the backend, not supabase.auth.updateUser. Both the
      // re-authentication and the password rules used to live only on this
      // screen — so a client that skipped them could set "gymsync123", which
      // sign-up would have rejected outright. The server owns both now.
      const { session } = await changePassword(await getToken(), current, next);
      // Adopt the replacement. Supabase revokes refresh tokens on a password
      // change, so skipping this leaves a session that works for another half
      // hour and then drops the user on the sign-in screen with no explanation.
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update password.');
    } finally {
      setBusy(false);
    }
  };

  const sendSetupLink = async () => {
    if (!user?.email) {
      setError('This account has no email address to send a link to.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await resetPassword(user.email);
    setBusy(false);
    if (err) setError(err);
    else setSent(true);
  };

  if (!hasPassword) {
    return (
      <SettingsPage
        title="Set a password"
        subtitle={
          sent
            ? undefined
            : 'You sign in with Apple or Google. Adding a password lets you sign in with your email too.'
        }
      >
        <View style={styles.fields}>
          {sent ? (
            <AppText variant="body">
              Check {user?.email ?? 'your inbox'} — the link opens GymSync so you can
              choose a password.
            </AppText>
          ) : (
            <>
              <AppText variant="body" color="textSecondary">
                We'll email {user?.email ?? 'you'} a link to set one. Your Apple and
                Google sign-in keeps working either way.
              </AppText>
              {error ? (
                <AppText variant="caption" color="dangerText">
                  {error}
                </AppText>
              ) : null}
              <Button
                title="Email me a link"
                onPress={() => void sendSetupLink()}
                loading={busy}
                disabled={busy}
              />
            </>
          )}
        </View>
      </SettingsPage>
    );
  }

  if (done) {
    return (
      <SettingsPage title="Password updated" subtitle="You're still signed in on this device.">
        <View style={styles.fields}>
          <AppText variant="body" color="textSecondary">
            Anywhere else you were signed in will need the new password.
          </AppText>
          <Button title="Done" onPress={() => nav.goBack()} />
        </View>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title="Change password"
      footer={
        <View style={styles.footer}>
          <Button title="Update password" onPress={submit} loading={busy} disabled={!valid} />
        </View>
      }
    >
      <View style={styles.fields}>
        <Input
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          secure
          placeholder="••••••••"
        />
        <View>
          <Input
            label="New password"
            value={next}
            onChangeText={setNext}
            secure
            placeholder="At least 8 characters"
            onFocus={() => setNextFocused(true)}
            onBlur={() => setNextFocused(false)}
          />
          <PasswordStrength
            value={next}
            visible={nextFocused}
            context={{ email: user?.email ?? undefined }}
            style={styles.strength}
          />
        </View>
        <Input
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          secure
          placeholder="Re-enter new password"
          error={confirm.length > 0 && confirm !== next}
        />
      </View>
      {error ? (
        <AppText variant="caption" color="dangerText" style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </SettingsPage>
  );
}

const useStyles = makeStyles(() => ({
  fields: { gap: spacing.md },
  strength: { marginTop: spacing.sm },
  error: { marginTop: spacing.sm },
  footer: { padding: spacing.lg },
}));

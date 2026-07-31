import { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { makeStyles, spacing } from '@/theme';
import { AppText, Button, Input } from '@/components/ui';
import { PasswordStrength } from '@/components/PasswordStrength';
import { checkPassword } from '@/lib/passwordStrength';
import { useAuth } from '@/auth/AuthContext';
import { changePassword } from '@/api/auth';
import { SettingsPage } from './SettingsKit';

export function ChangePasswordScreen() {
  const styles = useStyles();
  const nav = useNavigation();
  const { user, getToken } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      await changePassword(await getToken(), current, next);
      nav.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update password.');
    } finally {
      setBusy(false);
    }
  };

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

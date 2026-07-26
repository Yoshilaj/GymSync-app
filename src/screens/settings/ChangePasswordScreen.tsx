import { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { makeStyles, spacing } from '@/theme';
import { AppText, Button, Input } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/auth/supabase';
import { SettingsPage } from './SettingsKit';

export function ChangePasswordScreen() {
  const styles = useStyles();
  const nav = useNavigation();
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = current.length >= 6 && next.length >= 8 && next === confirm;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      // Re-authenticate with the current password before changing it.
      const { error: reauth } = await supabase.auth.signInWithPassword({
        email: user?.email ?? '',
        password: current,
      });
      if (reauth) throw new Error('Current password is incorrect.');
      const { error: err } = await supabase.auth.updateUser({ password: next });
      if (err) throw err;
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
        <Input
          label="New password"
          value={next}
          onChangeText={setNext}
          secure
          placeholder="At least 8 characters"
        />
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
  error: { marginTop: spacing.sm },
  footer: { padding: spacing.lg },
}));

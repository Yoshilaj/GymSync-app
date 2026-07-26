import { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { makeStyles, spacing } from '@/theme';
import { AppText, Button, Input } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/auth/supabase';
import { SettingsPage } from './SettingsKit';

export function ChangeEmailScreen() {
  const styles = useStyles();
  const nav = useNavigation();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const valid = /.+@.+\..+/.test(email) && email !== user?.email;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ email });
      if (err) throw err;
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update email.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <SettingsPage title="Change email">
        <View style={styles.done}>
          <AppText variant="h3">Check your inbox</AppText>
          <AppText variant="body" color="textSecondary" align="center">
            We sent a confirmation link to {email}. Your email changes once you
            confirm it from that message.
          </AppText>
          <Button title="Done" variant="secondary" onPress={() => nav.goBack()} />
        </View>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title="Change email"
      footer={
        <View style={styles.footer}>
          <Button title="Send confirmation" onPress={submit} loading={busy} disabled={!valid} />
        </View>
      }
    >
      <AppText variant="caption" color="textSecondary" style={styles.hint}>
        Current: {user?.email ?? '—'}
      </AppText>
      <Input
        label="New email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
        error={!!error}
      />
      {error ? (
        <AppText variant="caption" color="dangerText" style={styles.hint}>
          {error}
        </AppText>
      ) : null}
    </SettingsPage>
  );
}

const useStyles = makeStyles(() => ({
  hint: { marginTop: spacing.sm },
  footer: { padding: spacing.lg },
  done: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
}));

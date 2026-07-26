import { useState } from 'react';
import { View } from 'react-native';
import { makeStyles, spacing, useTheme } from '@/theme';
import { AppText, Button, Card, Input } from '@/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/auth/AuthContext';
import { deleteAccount } from '@/api/account';
import { SettingsPage } from './SettingsKit';

export function DeleteAccountScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { getToken, signOut } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(await getToken());
      await signOut(); // gate returns to the auth flow
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete account.');
      setBusy(false);
    }
  };

  return (
    <SettingsPage
      title="Delete account"
      footer={
        <View style={styles.footer}>
          <Button
            title="Delete my account"
            variant="danger"
            onPress={submit}
            loading={busy}
            disabled={confirm.trim().toUpperCase() !== 'DELETE'}
          />
        </View>
      }
    >
      <Card style={styles.warnCard}>
        <View style={styles.warnHead}>
          <Ionicons name="warning" size={20} color={colors.dangerText} />
          <AppText variant="h3" color="dangerText">
            This can't be undone
          </AppText>
        </View>
        <AppText variant="body" color="textSecondary">
          Deleting your account permanently erases your profile, workout plans,
          logged sets, conversations, and everything else tied to it.
        </AppText>
      </Card>

      <AppText variant="label" style={styles.label}>
        Type DELETE to confirm
      </AppText>
      <Input
        value={confirm}
        onChangeText={setConfirm}
        autoCapitalize="characters"
        placeholder="DELETE"
        error={!!error}
      />
      {error ? (
        <AppText variant="caption" color="dangerText" style={styles.label}>
          {error}
        </AppText>
      ) : null}
    </SettingsPage>
  );
}

const useStyles = makeStyles((t) => ({
  warnCard: { gap: spacing.sm, backgroundColor: t.colors.dangerSoft },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { marginTop: spacing.lg, marginBottom: spacing.sm },
  footer: { padding: spacing.lg },
}));

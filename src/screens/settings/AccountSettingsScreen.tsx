import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@/auth/AuthContext';
import { getMfaStatus } from '@/auth/mfa';
import type { SettingsStackParamList } from '@/navigation/SettingsNavigator';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import {
  DestructiveRow,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
} from './SettingsKit';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'AccountSettings'>;

export function AccountSettingsScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // null while unknown, so the row shows no value rather than flashing "Off"
  // at someone who actually has it on. Re-read on focus: this screen is where
  // you come back to after switching it.
  const [twoFactor, setTwoFactor] = useState<boolean | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getMfaStatus().then(({ enrolled }) => {
        if (!cancelled) setTwoFactor(enrolled);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <SettingsPage title="Account settings">
      <SettingsGroup title="Sign-in" inset>
        <SettingsRow
          label="Email"
          sublabel={user?.email ?? undefined}
          icon="mail-outline"
          chevron
          onPress={() => nav.navigate('ChangeEmail')}
        />
        <SettingsRow
          label="Password"
          icon="lock-closed-outline"
          chevron
          onPress={() => nav.navigate('ChangePassword')}
        />
        <SettingsRow
          label="Two-factor authentication"
          icon="shield-checkmark-outline"
          value={twoFactor === null ? undefined : twoFactor ? 'On' : 'Off'}
          chevron
          onPress={() => nav.navigate('TwoFactor')}
        />
      </SettingsGroup>

      <SettingsGroup footnote="Deleting your account permanently erases your profile, plans, and history.">
        <DestructiveRow
          label="Delete account"
          onPress={() => setConfirmingDelete(true)}
        />
      </SettingsGroup>

      <DeleteAccountDialog
        visible={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
      />
    </SettingsPage>
  );
}

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@/auth/AuthContext';
import type { SettingsStackParamList } from '@/navigation/SettingsNavigator';
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
      </SettingsGroup>

      <SettingsGroup footnote="Deleting your account permanently erases your profile, plans, and history.">
        <DestructiveRow
          label="Delete account"
          onPress={() => nav.navigate('DeleteAccount')}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

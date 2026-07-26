import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ListRow } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import type { SettingsStackParamList } from '@/navigation/SettingsNavigator';
import { SettingsGroup, SettingsPage } from './SettingsKit';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'AccountSettings'>;

export function AccountSettingsScreen() {
  const nav = useNavigation<Nav>();
  const { user } = useAuth();

  return (
    <SettingsPage title="Account settings">
      <SettingsGroup title="Sign-in">
        <ListRow
          title="Email"
          subtitle={user?.email ?? undefined}
          left={{ icon: 'mail', tone: 'accent' }}
          chevron
          onPress={() => nav.navigate('ChangeEmail')}
        />
        <ListRow
          title="Password"
          left={{ icon: 'lock-closed', tone: 'accent' }}
          chevron
          onPress={() => nav.navigate('ChangePassword')}
        />
      </SettingsGroup>

      <SettingsGroup title="Danger zone">
        <ListRow
          title="Delete account"
          subtitle="Permanently erase your account and data."
          left={{ icon: 'trash', tone: 'danger' }}
          chevron
          onPress={() => nav.navigate('DeleteAccount')}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

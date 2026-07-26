import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing, useThemePref } from '@/theme';
import { Button } from '@/components/ui';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/auth/AuthContext';
import type { SettingsStackParamList } from '@/navigation/SettingsNavigator';
import { SettingsGroup, SettingsPage, ValueRow } from './SettingsKit';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'SettingsHome'>;

const THEME_LABEL = { light: 'Light', dark: 'Dark', system: 'System' } as const;

export function SettingsHomeScreen() {
  const nav = useNavigation<Nav>();
  const { user, profile } = useUser();
  const { signOut } = useAuth();
  const { preference } = useThemePref();
  const [signingOut, setSigningOut] = useState(false);

  const language = (profile?.preferences?.language as string) ?? 'English';

  const confirmSignOut = () => {
    Alert.alert('Sign out?', "You'll need your password to sign back in.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  return (
    <SettingsPage
      title="Settings"
      footer={
        <View style={{ padding: spacing.lg }}>
          <Button
            title="Sign out"
            variant="secondary"
            icon="log-out"
            loading={signingOut}
            onPress={confirmSignOut}
          />
        </View>
      }
    >
      <SettingsGroup title="Account">
        <ValueRow label="Profile" chevron onPress={() => nav.navigate('Profile')} />
        <ValueRow
          label="Account settings"
          chevron
          onPress={() => nav.navigate('AccountSettings')}
        />
        <ValueRow label="Plan" value="Free" chevron onPress={() => nav.navigate('PlanSettings')} />
        <ValueRow
          label="Notifications"
          chevron
          onPress={() => nav.navigate('Notifications')}
        />
        <ValueRow label="Workout" chevron onPress={() => nav.navigate('WorkoutSettings')} />
      </SettingsGroup>

      <SettingsGroup title="Environment">
        <ValueRow label="Language" value={language} chevron onPress={() => nav.navigate('Language')} />
        <ValueRow
          label="Units"
          value={user.units === 'kg' ? 'Kilograms' : 'Pounds'}
          chevron
          onPress={() => nav.navigate('Units')}
        />
        <ValueRow
          label="Theme"
          value={THEME_LABEL[preference]}
          chevron
          onPress={() => nav.navigate('Theme')}
        />
      </SettingsGroup>

      <SettingsGroup title="Help">
        <ValueRow label="Inquiry" chevron onPress={() => nav.navigate('Inquiry')} />
        <ValueRow label="FAQ" chevron onPress={() => nav.navigate('Faq')} />
        <ValueRow label="About us" chevron onPress={() => nav.navigate('AboutUs')} />
      </SettingsGroup>
    </SettingsPage>
  );
}

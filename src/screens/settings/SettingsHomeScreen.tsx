import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { makeStyles, spacing, useTheme, useThemePref } from '@/theme';
import { AnimatedPressable, AppText, Card } from '@/components/ui';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/auth/AuthContext';
import type { SettingsStackParamList } from '@/navigation/SettingsNavigator';
import {
  DestructiveRow,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
} from './SettingsKit';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'SettingsHome'>;

const THEME_LABEL = { light: 'Light', dark: 'Dark', system: 'System' } as const;

export function SettingsHomeScreen() {
  const nav = useNavigation<Nav>();
  const styles = useStyles();
  const { colors } = useTheme();
  const { user, profile } = useUser();
  const { user: authUser, signOut } = useAuth();
  const { preference } = useThemePref();

  const language = (profile?.preferences?.language as string) ?? 'English';

  const confirmSignOut = () => {
    Alert.alert('Sign out?', "You'll need your password to sign back in.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => void signOut(),
      },
    ]);
  };

  return (
    <SettingsPage title="Settings">
      <AnimatedPressable onPress={() => nav.navigate('Profile')}>
        <Card style={styles.profileCard}>
          <ProfileAvatar
            name={user.displayName || 'Y'}
            size={44}
            uri={profile?.avatar_url ?? null}
          />
          <View style={styles.profileText}>
            <AppText variant="h3" numberOfLines={1}>
              {user.displayName || 'Your profile'}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {authUser?.email ?? 'Name, photo, body stats'}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </Card>
      </AnimatedPressable>

      <SettingsGroup title="👤  Account" inset>
        <SettingsRow
          label="Account settings"
          icon="key-outline"
          chevron
          onPress={() => nav.navigate('AccountSettings')}
        />
        <SettingsRow
          label="Plan"
          icon="card-outline"
          value="Free"
          chevron
          onPress={() => nav.navigate('PlanSettings')}
        />
        <SettingsRow
          label="Notifications"
          icon="notifications-outline"
          chevron
          onPress={() => nav.navigate('Notifications')}
        />
        <SettingsRow
          label="Workout"
          icon="barbell-outline"
          chevron
          onPress={() => nav.navigate('WorkoutSettings')}
        />
      </SettingsGroup>

      <SettingsGroup title="⚙️  Preferences" inset>
        <SettingsRow
          label="Language"
          icon="language-outline"
          value={language}
          chevron
          onPress={() => nav.navigate('Language')}
        />
        <SettingsRow
          label="Units"
          icon="scale-outline"
          value={user.units === 'kg' ? 'Kilograms' : 'Pounds'}
          chevron
          onPress={() => nav.navigate('Units')}
        />
        <SettingsRow
          label="Theme"
          icon="moon-outline"
          value={THEME_LABEL[preference]}
          chevron
          onPress={() => nav.navigate('Theme')}
        />
      </SettingsGroup>

      <SettingsGroup title="💬  Support" inset>
        <SettingsRow
          label="Contact support"
          icon="mail-outline"
          chevron
          onPress={() => nav.navigate('Inquiry')}
        />
        <SettingsRow
          label="FAQ"
          icon="help-circle-outline"
          chevron
          onPress={() => nav.navigate('Faq')}
        />
        <SettingsRow
          label="About us"
          icon="information-circle-outline"
          chevron
          onPress={() => nav.navigate('AboutUs')}
        />
      </SettingsGroup>

      {__DEV__ && (
        <SettingsGroup title="🛠  Developer" inset>
          <SettingsRow
            label="Replay onboarding"
            icon="refresh-outline"
            value="Preview"
            chevron
            onPress={() => nav.navigate('OnboardingPreview')}
          />
        </SettingsGroup>
      )}

      <SettingsGroup>
        <DestructiveRow label="Sign out" onPress={confirmSignOut} />
      </SettingsGroup>
    </SettingsPage>
  );
}

const useStyles = makeStyles(() => ({
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  profileText: { flex: 1, gap: spacing.xxs },
}));

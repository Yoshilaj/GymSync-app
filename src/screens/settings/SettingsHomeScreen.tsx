import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { makeStyles, spacing, useTheme, useThemePref } from '@/theme';
import { AnimatedPressable, AppText, Card, Skeleton } from '@/components/ui';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/auth/AuthContext';
import { useEntitlement } from '@/hooks';
import { useBilling } from '@/billing/BillingProvider';
import { TIERS } from '@/screens/pricing';
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
  // Reads the billing seam rather than a literal. Resolves to "Free" today, and
  // becomes correct on its own the moment a real purchase SDK is wired in.
  const { entitlement, status: entitlementStatus } = useEntitlement();
  const { manage } = useBilling();

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
        {/* The default entitlement is Free, so until the real one lands this
            row states "Free" as fact — to subscribers included. Skeleton the
            value, not the row: a whole row appearing would shift the list. */}
        <SettingsRow
          label="Plan"
          icon="card-outline"
          value={entitlementStatus === 'loading' ? undefined : TIERS[entitlement.tier].name}
          right={
            entitlementStatus === 'loading' ? <Skeleton width={52} height={14} /> : undefined
          }
          chevron
          onPress={() => nav.navigate('Pricing')}
        />
        {/* Only for someone who actually has a subscription to manage — on
            Free this row would open Apple's sheet to an empty list. The Terms
            promise this link exists in Settings, and App Review looks for it. */}
        {entitlement.tier !== 'free' ? (
          <SettingsRow
            label="Manage subscription"
            icon="open-outline"
            chevron
            onPress={() => void manage()}
          />
        ) : null}
        {/* Notifications is deliberately not linked yet. The screen and the
            stored preferences still exist, but expo-notifications isn't
            installed and nothing delivers — and "Rest timer alert" is the one
            a user would trust mid-set and be let down by. A footnote saying
            "coming soon" under a switch that moves doesn't undo that. Restore
            this row in the same commit that ships delivery. */}
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

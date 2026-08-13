import { useState } from 'react';
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
import { BillingError } from '@/api/billing';
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
  const { entitlement, status: entitlementStatus, refresh } = useEntitlement();
  const { manage, restore } = useBilling();
  const [restoring, setRestoring] = useState(false);

  const language = (profile?.preferences?.language as string) ?? 'English';

  /**
   * The same call the paywall footer makes, and the same reading of the result.
   *
   * A restore that finds nothing is an *answer*, not a failure — it means this
   * Apple ID never bought anything — so it gets a plain statement rather than an
   * error. Backing out of Apple's sheet is silent for the same reason.
   */
  const runRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const next = await restore();
      if (next.tier === 'free') {
        Alert.alert('Nothing to restore', 'No previous purchase found on this Apple ID.');
        return;
      }
      await refresh();
      Alert.alert('Purchases restored', `Your ${TIERS[next.tier].name} plan is active again.`);
    } catch (e) {
      if (e instanceof BillingError && e.code === 'cancelled') return;
      Alert.alert(
        'Could not restore',
        e instanceof Error ? e.message : 'Something went wrong. Try again.',
      );
    } finally {
      setRestoring(false);
    }
  };

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
            name={user.displayName}
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
          // 'error' must not assert "Free" to a paying customer whose
          // entitlement read merely failed — an em dash is an honest unknown.
          value={
            entitlementStatus === 'loading'
              ? undefined
              : entitlementStatus === 'error'
                ? '—'
                : TIERS[entitlement.tier].name
          }
          right={
            entitlementStatus === 'loading' ? <Skeleton width={52} height={14} /> : undefined
          }
          chevron
          onPress={() => nav.navigate('Pricing')}
        />
        {/* Only for someone who actually has a subscription to manage — on
            Free this row would open Apple's sheet to an empty list. The Terms
            promise this link exists in Settings, and App Review looks for it —
            which is why an UNKNOWN entitlement ('error') keeps the row: hiding
            an Apple-mandated link from a real subscriber over a network blip
            is the worse mistake (a Free user just sees Apple's empty sheet). */}
        {entitlement.tier !== 'free' || entitlementStatus === 'error' ? (
          <SettingsRow
            label="Manage subscription"
            icon="open-outline"
            chevron
            onPress={() => void manage()}
          />
        ) : null}
        {/* Unlike "Manage subscription", this shows on every tier — an account
            that *looks* Free while Apple still holds a live subscription is the
            exact case restore exists for, and gating it on tier would hide it
            from everyone who needs it. Until now the paywall footer was the
            only restore in the app, so a subscriber reinstalling had to go
            looking for a price list to get their purchase back. Apple requires
            the mechanism (3.1.1); a customer requires it to be findable. */}
        <SettingsRow
          label="Restore purchases"
          icon="refresh-outline"
          value={restoring ? 'Restoring…' : undefined}
          onPress={() => void runRestore()}
        />
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

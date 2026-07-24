import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import {
  AppText,
  Button,
  Card,
  ListRow,
  Screen,
  Skeleton,
} from '@/components/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/auth/AuthContext';
import { fetchPersonality, updatePersonality } from '@/api/personality';
import { CoachPersonality, Units } from '@/types';

const PERSONALITY_OPTIONS: {
  id: CoachPersonality;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'supportive',
    label: 'Supportive',
    hint: 'Warm, patient, celebrates wins.',
    icon: 'heart',
  },
  {
    id: 'classic',
    label: 'Classic',
    hint: 'Calm, precise, data-driven.',
    icon: 'analytics',
  },
  {
    id: 'energetic',
    label: 'Energetic',
    hint: 'High-energy hype, short and punchy.',
    icon: 'flash',
  },
];

const UNITS_OPTIONS: { id: Units; label: string }[] = [
  { id: 'lbs', label: 'Pounds' },
  { id: 'kg', label: 'Kilograms' },
];

type PersonalityStatus = 'loading' | 'ready' | 'offline';

export function SettingsScreen() {
  const { user, setPersonality, setUnits, toggleWorkoutNotifications } =
    useUser();
  const { user: authUser, getToken, signOut } = useAuth();
  const [personalityStatus, setPersonalityStatus] =
    useState<PersonalityStatus>('loading');
  const [signingOut, setSigningOut] = useState(false);

  // Hydrate the coach personality from the backend (source of truth).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const remote = await fetchPersonality(token);
        if (!cancelled) {
          setPersonality(remote.preset_id);
          setPersonalityStatus('ready');
        }
      } catch {
        if (!cancelled) setPersonalityStatus('offline');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectPersonality = useCallback(
    async (next: CoachPersonality) => {
      const previous = user.coachPersonality;
      if (next === previous) return;
      setPersonality(next); // optimistic
      try {
        const token = await getToken();
        await updatePersonality(token, next);
      } catch {
        setPersonality(previous); // revert
        Alert.alert(
          "Couldn't update your coach",
          'Check your connection and try again.',
        );
      }
    },
    [user.coachPersonality, setPersonality, getToken],
  );

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
    <Screen scroll padded={false}>
      {/* Pushed from the profile page — back affordance only, no title. */}
      <ScreenHeader variant="detail" />

      <View style={styles.content}>
        <SectionHeader title="Profile" />
        <Card padded={false}>
          <ListRow
            title={user.displayName}
            subtitle={authUser?.email ?? undefined}
            left={
              <View style={styles.avatar}>
                <AppText variant="h3" color="textInverse">
                  {user.displayName.slice(0, 1).toUpperCase()}
                </AppText>
              </View>
            }
          />
        </Card>

        <SectionHeader
          title="Coach personality"
          subtitle="How Sync talks to you — each has its own voice"
        />
        {personalityStatus === 'loading' ? (
          <Card>
            <View style={styles.skeletonRow}>
              <Skeleton width={36} height={36} />
              <View style={styles.skeletonLines}>
                <Skeleton width="60%" height={12} />
                <Skeleton width="40%" height={12} />
              </View>
            </View>
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {personalityStatus === 'offline' && (
              <AppText variant="caption" color="warningText">
                Couldn't reach your coach — changes may not save.
              </AppText>
            )}
            {PERSONALITY_OPTIONS.map((opt) => {
              const selected = user.coachPersonality === opt.id;
              return (
                <Card
                  key={opt.id}
                  onPress={() => selectPersonality(opt.id)}
                  style={[
                    styles.optionCard,
                    selected && styles.optionCardSelected,
                  ]}
                >
                  <View style={styles.optionRow}>
                    <View
                      style={[
                        styles.optionIcon,
                        selected && { backgroundColor: colors.accent },
                      ]}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={18}
                        color={selected ? colors.textInverse : colors.accentText}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="h3">{opt.label}</AppText>
                      <AppText variant="caption">{opt.hint}</AppText>
                    </View>
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={22}
                      color={selected ? colors.accent : colors.textTertiary}
                    />
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        <SectionHeader title="Units" />
        <Card padded={false}>
          {UNITS_OPTIONS.map((opt, i) => (
            <View key={opt.id}>
              <ListRow
                title={opt.label}
                onPress={() => setUnits(opt.id)}
                right={
                  <Ionicons
                    name={
                      user.units === opt.id
                        ? 'checkmark-circle'
                        : 'ellipse-outline'
                    }
                    size={22}
                    color={
                      user.units === opt.id
                        ? colors.accent
                        : colors.textTertiary
                    }
                  />
                }
              />
              {i < UNITS_OPTIONS.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </Card>

        <SectionHeader title="Notifications" />
        <Card padded={false}>
          <ListRow
            title="Workout reminders"
            subtitle="A nudge before your planned session."
            right={
              <Switch
                value={user.notificationsWorkout}
                onValueChange={toggleWorkoutNotifications}
                trackColor={{ false: colors.border, true: colors.accentSoft }}
                thumbColor={
                  user.notificationsWorkout ? colors.accent : colors.card
                }
              />
            }
          />
        </Card>

        <SectionHeader title="About" />
        <Card padded={false}>
          <ListRow
            title="Version"
            right={<AppText variant="body" color="textSecondary">0.2.0</AppText>}
          />
          <View style={styles.divider} />
          <ListRow
            title="Privacy"
            right={
              <AppText variant="body" color="textSecondary">
                Coming soon
              </AppText>
            }
          />
        </Card>

        <View style={{ marginTop: spacing.xl }}>
          <Button
            title="Sign out"
            variant="secondary"
            icon="log-out"
            loading={signingOut}
            onPress={confirmSignOut}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCard: { paddingVertical: spacing.md },
  optionCardSelected: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  skeletonLines: { flex: 1, gap: spacing.sm },
});

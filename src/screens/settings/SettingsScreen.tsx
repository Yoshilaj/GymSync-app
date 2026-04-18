import { View, Text, StyleSheet, Switch, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Card } from '@/components/Card';
import { SectionHeader } from '@/components/SectionHeader';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, radius, spacing, typography } from '@/theme';
import { useUser } from '@/context/UserContext';
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
    id: 'intense',
    label: 'Intense',
    hint: 'Direct, no-nonsense, pushes hard.',
    icon: 'flame',
  },
  {
    id: 'roast_light',
    label: 'Roast-light',
    hint: 'Sarcastic but fair. Not abusive.',
    icon: 'flash',
  },
];

const UNITS_OPTIONS: { id: Units; label: string }[] = [
  { id: 'lbs', label: 'Pounds' },
  { id: 'kg', label: 'Kilograms' },
];

export function SettingsScreen() {
  const {
    user,
    setPersonality,
    setUnits,
    toggleWorkoutNotifications,
    toggleMealNotifications,
  } = useUser();

  return (
    <ScreenContainer scroll>
      <Text style={typography.heading}>Settings</Text>

      <SectionHeader title="Profile" />
      <Card>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user.displayName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={typography.subtitle}>{user.displayName}</Text>
            <Text style={typography.caption}>Change name in account (coming soon)</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Card>

      <SectionHeader title="Coach personality" subtitle="How Homie talks to you" />
      <View style={{ gap: spacing.sm }}>
        {PERSONALITY_OPTIONS.map((opt) => {
          const selected = user.coachPersonality === opt.id;
          return (
            <Pressable key={opt.id} onPress={() => setPersonality(opt.id)}>
              <Card
                style={[
                  styles.optionCard,
                  selected && { borderColor: colors.accent },
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
                      color={selected ? '#fff' : colors.accent}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.subtitle}>{opt.label}</Text>
                    <Text style={typography.caption}>{opt.hint}</Text>
                  </View>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={selected ? colors.accent : colors.textMuted}
                  />
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <SectionHeader title="Units" />
      <Card padded={false}>
        {UNITS_OPTIONS.map((opt, i) => (
          <Pressable
            key={opt.id}
            onPress={() => setUnits(opt.id)}
            style={[
              styles.listRow,
              i < UNITS_OPTIONS.length - 1 && styles.listRowBorder,
            ]}
          >
            <Text style={typography.body}>{opt.label}</Text>
            <Ionicons
              name={user.units === opt.id ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={user.units === opt.id ? colors.accent : colors.textMuted}
            />
          </Pressable>
        ))}
      </Card>

      <SectionHeader title="Notifications" />
      <Card padded={false}>
        <View style={[styles.listRow, styles.listRowBorder]}>
          <View style={{ flex: 1 }}>
            <Text style={typography.body}>Workout reminders</Text>
            <Text style={typography.caption}>
              A nudge before your planned session.
            </Text>
          </View>
          <Switch
            value={user.notificationsWorkout}
            onValueChange={toggleWorkoutNotifications}
            trackColor={{ false: colors.border, true: colors.accentMuted }}
            thumbColor={user.notificationsWorkout ? colors.accent : '#fff'}
          />
        </View>
        <View style={styles.listRow}>
          <View style={{ flex: 1 }}>
            <Text style={typography.body}>Meal logging</Text>
            <Text style={typography.caption}>
              Ping when meals are typically skipped.
            </Text>
          </View>
          <Switch
            value={user.notificationsMeal}
            onValueChange={toggleMealNotifications}
            trackColor={{ false: colors.border, true: colors.accentMuted }}
            thumbColor={user.notificationsMeal ? colors.accent : '#fff'}
          />
        </View>
      </Card>

      <SectionHeader title="About" />
      <Card padded={false}>
        <AboutRow label="Version" value="0.1.0 (MVP)" />
        <AboutRow label="Privacy" value="Coming soon" withBorder={false} />
      </Card>

      <View style={{ marginTop: spacing.xl }}>
        <PrimaryButton
          title="Sign out"
          variant="secondary"
          icon="log-out"
          onPress={() =>
            Alert.alert('Sign out', 'Auth not wired up in MVP.')
          }
        />
      </View>
    </ScreenContainer>
  );
}

function AboutRow({
  label,
  value,
  withBorder = true,
}: {
  label: string;
  value: string;
  withBorder?: boolean;
}) {
  return (
    <View style={[styles.listRow, withBorder && styles.listRowBorder]}>
      <Text style={typography.body}>{label}</Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  optionCard: { paddingVertical: spacing.md },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  listRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});

import { useCallback } from 'react';
import { Alert, View } from 'react-native';
import { makeStyles, spacing } from '@/theme';
import { AppText, Card, Chip } from '@/components/ui';
import { SectionHeader } from '@/components/SectionHeader';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/auth/AuthContext';
import { updatePersonality } from '@/api/personality';
import type { CoachPersonality } from '@/types';
import type { ExperienceLevel } from '@/api/profile';
import { SettingsPage } from './SettingsKit';

const EXPERIENCE: { id: ExperienceLevel; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];
const GOALS = [
  { id: 'muscle', label: 'Build muscle' },
  { id: 'strength', label: 'Get stronger' },
  { id: 'fat_loss', label: 'Lose fat' },
  { id: 'general_fitness', label: 'General fitness' },
  { id: 'endurance', label: 'Endurance' },
];
const PERSONALITY: { id: CoachPersonality; label: string }[] = [
  { id: 'supportive', label: 'Supportive' },
  { id: 'classic', label: 'Classic' },
  { id: 'energetic', label: 'Energetic' },
];
const DAYS = [2, 3, 4, 5, 6];
const LENGTHS = [30, 45, 60, 75, 90];

function ChipCard({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <Card>
      <View style={styles.chips}>{children}</View>
    </Card>
  );
}

export function WorkoutSettingsScreen() {
  const styles = useStyles();
  const { user, profile, setPersonality, saveProfile } = useUser();
  const { getToken } = useAuth();

  const goals = profile?.goals ?? [];

  const toggleGoal = (id: string) => {
    const next = goals.includes(id) ? goals.filter((g) => g !== id) : [...goals, id];
    void saveProfile({ goals: next });
  };

  const selectPersonality = useCallback(
    async (next: CoachPersonality) => {
      const previous = user.coachPersonality;
      if (next === previous) return;
      setPersonality(next);
      try {
        await updatePersonality(await getToken(), next);
      } catch {
        setPersonality(previous);
        Alert.alert("Couldn't update your coach", 'Check your connection and try again.');
      }
    },
    [user.coachPersonality, setPersonality, getToken],
  );

  return (
    <SettingsPage title="Workout" subtitle="Tune how your coach programs for you">
      <SectionHeader title="Experience" />
      <ChipCard>
        {EXPERIENCE.map((e) => (
          <Chip
            key={e.id}
            label={e.label}
            selected={profile?.experience === e.id}
            onPress={() => saveProfile({ experience: e.id })}
          />
        ))}
      </ChipCard>

      <SectionHeader title="Goals" subtitle="Pick everything that applies" />
      <ChipCard>
        {GOALS.map((g) => (
          <Chip
            key={g.id}
            label={g.label}
            selected={goals.includes(g.id)}
            onPress={() => toggleGoal(g.id)}
          />
        ))}
      </ChipCard>

      <SectionHeader title="Coach personality" subtitle="How Sync talks to you" />
      <ChipCard>
        {PERSONALITY.map((p) => (
          <Chip
            key={p.id}
            label={p.label}
            selected={user.coachPersonality === p.id}
            onPress={() => selectPersonality(p.id)}
          />
        ))}
      </ChipCard>

      <SectionHeader title="Training days / week" />
      <ChipCard>
        {DAYS.map((d) => (
          <Chip
            key={d}
            label={`${d}`}
            selected={profile?.training_days === d}
            onPress={() => saveProfile({ training_days: d })}
          />
        ))}
      </ChipCard>

      <SectionHeader title="Session length" />
      <ChipCard>
        {LENGTHS.map((m) => (
          <Chip
            key={m}
            label={`${m} min`}
            selected={profile?.session_minutes === m}
            onPress={() => saveProfile({ session_minutes: m })}
          />
        ))}
      </ChipCard>

      <AppText
        variant="caption"
        color="textTertiary"
        style={styles.note}
      >
        Changes apply the next time your coach builds or adjusts a plan.
      </AppText>
    </SettingsPage>
  );
}

const useStyles = makeStyles(() => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { marginTop: spacing.md },
}));

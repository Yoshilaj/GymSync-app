import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { NumberWheel, WheelRow as WheelBand, WheelUnit } from '@/components/ui';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/auth/AuthContext';
import { updatePersonality } from '@/api/personality';
import type { CoachPersonality } from '@/types';
import type { ExperienceLevel } from '@/api/profile';
import {
  CheckRow,
  SettingsGroup,
  SettingsPage,
  WheelRow,
  useDebouncedCommit,
} from './SettingsKit';

const EXPERIENCE: { id: ExperienceLevel; label: string; sublabel: string }[] = [
  { id: 'beginner', label: 'Beginner', sublabel: 'New to lifting, or coming back' },
  { id: 'intermediate', label: 'Intermediate', sublabel: 'Consistent for 6+ months' },
  { id: 'advanced', label: 'Advanced', sublabel: 'Years of structured training' },
];
const GOALS = [
  { id: 'muscle', label: 'Build muscle' },
  { id: 'strength', label: 'Get stronger' },
  { id: 'fat_loss', label: 'Lose fat' },
  { id: 'general_fitness', label: 'General fitness' },
  { id: 'endurance', label: 'Endurance' },
];
const PERSONALITY: { id: CoachPersonality; label: string; sublabel: string }[] = [
  { id: 'supportive', label: 'Supportive', sublabel: 'Warm, patient, celebrates the small wins' },
  { id: 'classic', label: 'Classic', sublabel: 'Straightforward and to the point' },
  { id: 'energetic', label: 'Energetic', sublabel: 'High energy, keeps the pace up' },
];

export function WorkoutSettingsScreen() {
  const { user, profile, setPersonality, saveProfile } = useUser();
  const { getToken } = useAuth();

  const goals = profile?.goals ?? [];
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) =>
    setOpenKey((cur) => (cur === key ? null : key));

  // Optimistic local mirrors so the wheels track instantly.
  const [days, setDays] = useState(profile?.training_days ?? 4);
  const [minutes, setMinutes] = useState(profile?.session_minutes ?? 60);
  const commitDays = useDebouncedCommit((d) => void saveProfile({ training_days: d }));
  const commitMinutes = useDebouncedCommit((m) => void saveProfile({ session_minutes: m }));

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
    <SettingsPage title="Workout">
      <SettingsGroup title="Experience">
        {EXPERIENCE.map((e) => (
          <CheckRow
            key={e.id}
            label={e.label}
            sublabel={e.sublabel}
            selected={profile?.experience === e.id}
            onPress={() => void saveProfile({ experience: e.id })}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="Goals" footnote="Pick everything that applies.">
        {GOALS.map((g) => (
          <CheckRow
            key={g.id}
            label={g.label}
            multi
            selected={goals.includes(g.id)}
            onPress={() => toggleGoal(g.id)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="Coach personality">
        {PERSONALITY.map((p) => (
          <CheckRow
            key={p.id}
            label={p.label}
            sublabel={p.sublabel}
            selected={user.coachPersonality === p.id}
            onPress={() => void selectPersonality(p.id)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup
        title="Schedule"
        footnote="Changes apply the next time your coach builds or adjusts a plan."
      >
        <WheelRow
          label="Training days"
          value={`${days} / week`}
          open={openKey === 'days'}
          onToggle={() => toggle('days')}
        >
          <WheelBand>
            <NumberWheel
              min={1}
              max={6}
              value={days}
              onChange={(d) => {
                setDays(d);
                commitDays(d);
              }}
              width={64}
              showBand={false}
              accessibilityLabel="Training days per week"
            />
            <WheelUnit label="days" />
          </WheelBand>
        </WheelRow>
        <WheelRow
          label="Session length"
          value={`${minutes} min`}
          open={openKey === 'minutes'}
          onToggle={() => toggle('minutes')}
        >
          <WheelBand>
            <NumberWheel
              min={20}
              max={120}
              step={5}
              value={minutes}
              onChange={(m) => {
                setMinutes(m);
                commitMinutes(m);
              }}
              width={96}
              showBand={false}
              accessibilityLabel="Session length"
            />
            <WheelUnit label="min" />
          </WheelBand>
        </WheelRow>
      </SettingsGroup>
    </SettingsPage>
  );
}

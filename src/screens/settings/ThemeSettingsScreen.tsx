import { useThemePref, type ThemePreference } from '@/theme';
import { useUser } from '@/context/UserContext';
import { CheckRow, SettingsGroup, SettingsPage } from './SettingsKit';

const OPTIONS: { id: ThemePreference; label: string; sublabel?: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System', sublabel: 'Match your device setting' },
];

export function ThemeSettingsScreen() {
  const { preference, setThemePreference } = useThemePref();
  const { profile, saveProfile } = useUser();

  const choose = (id: ThemePreference) => {
    if (id === preference) return;
    setThemePreference(id);
    void saveProfile({ preferences: { ...(profile?.preferences ?? {}), theme: id } });
  };

  return (
    <SettingsPage title="Theme">
      <SettingsGroup footnote="Your choice syncs to your account and follows you across devices.">
        {OPTIONS.map((o) => (
          <CheckRow
            key={o.id}
            label={o.label}
            sublabel={o.sublabel}
            selected={preference === o.id}
            onPress={() => choose(o.id)}
          />
        ))}
      </SettingsGroup>
    </SettingsPage>
  );
}

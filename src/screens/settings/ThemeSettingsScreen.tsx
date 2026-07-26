import { useThemePref, type ThemePreference } from '@/theme';
import { useUser } from '@/context/UserContext';
import { SettingsGroup, SettingsPage, SelectRow } from './SettingsKit';

// The app-wide dark migration is complete — Dark/System are live.
const DARK_ENABLED = true;

const OPTIONS: { id: ThemePreference; label: string; sublabel: string }[] = [
  { id: 'light', label: 'Light', sublabel: 'Always the light theme' },
  { id: 'dark', label: 'Dark', sublabel: 'Always the dark theme' },
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
    <SettingsPage title="Theme" subtitle="Light, dark, or follow your device">
      <SettingsGroup>
        {OPTIONS.map((o) => {
          const disabled = o.id !== 'light' && !DARK_ENABLED;
          return (
            <SelectRow
              key={o.id}
              label={o.label}
              sublabel={disabled ? 'Coming soon' : o.sublabel}
              selected={preference === o.id}
              disabled={disabled}
              onPress={() => choose(o.id)}
            />
          );
        })}
      </SettingsGroup>
    </SettingsPage>
  );
}

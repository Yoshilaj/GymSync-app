import { useThemePref, type ThemePreference } from '@/theme';
import { useUser } from '@/context/UserContext';
import { SettingsGroup, SettingsPage, SelectRow } from './SettingsKit';

// Flipped to true once the app-wide dark migration lands (Phase 4). Until then
// Dark/System render disabled so users never see a half-dark app.
const DARK_ENABLED = false;

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

import { useUser } from '@/context/UserContext';
import { CheckRow, SettingsGroup, SettingsPage } from './SettingsKit';

// English is live; the rest are placeholders until translations exist.
const LANGUAGES = [
  { id: 'English', enabled: true },
  { id: 'Español', enabled: false },
  { id: '日本語', enabled: false },
  { id: 'Français', enabled: false },
  { id: 'Deutsch', enabled: false },
  { id: '한국어', enabled: false },
];

export function LanguageSettingsScreen() {
  const { profile, saveProfile } = useUser();
  const current = (profile?.preferences?.language as string) ?? 'English';

  const choose = (id: string) => {
    if (id === current) return;
    void saveProfile({ preferences: { ...(profile?.preferences ?? {}), language: id } });
  };

  return (
    <SettingsPage title="Language">
      <SettingsGroup footnote="More languages are on the way.">
        {LANGUAGES.map((l) => (
          <CheckRow
            key={l.id}
            label={l.id}
            selected={current === l.id}
            disabled={!l.enabled}
            onPress={() => choose(l.id)}
          />
        ))}
      </SettingsGroup>
    </SettingsPage>
  );
}

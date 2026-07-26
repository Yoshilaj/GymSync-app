import { useUser } from '@/context/UserContext';
import type { Units } from '@/types';
import { CheckRow, SettingsGroup, SettingsPage } from './SettingsKit';

const OPTIONS: { id: Units; label: string; sublabel: string }[] = [
  { id: 'lbs', label: 'Pounds', sublabel: 'lb · ft / in' },
  { id: 'kg', label: 'Kilograms', sublabel: 'kg · cm' },
];

export function UnitsSettingsScreen() {
  const { user, setUnits, saveProfile } = useUser();

  const choose = (id: Units) => {
    if (id === user.units) return;
    setUnits(id);
    void saveProfile({ units: id });
  };

  return (
    <SettingsPage title="Units">
      <SettingsGroup footnote="Applies everywhere — weights, body stats, and your coach's suggestions.">
        {OPTIONS.map((o) => (
          <CheckRow
            key={o.id}
            label={o.label}
            sublabel={o.sublabel}
            selected={user.units === o.id}
            onPress={() => choose(o.id)}
          />
        ))}
      </SettingsGroup>
    </SettingsPage>
  );
}

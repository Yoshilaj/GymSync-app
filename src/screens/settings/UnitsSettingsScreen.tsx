import { useUser } from '@/context/UserContext';
import type { Units } from '@/types';
import { SettingsGroup, SettingsPage, SelectRow } from './SettingsKit';

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
    <SettingsPage title="Units" subtitle="How weights and measurements are shown">
      <SettingsGroup>
        {OPTIONS.map((o) => (
          <SelectRow
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

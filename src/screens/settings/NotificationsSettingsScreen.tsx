import { useUser } from '@/context/UserContext';
import { SettingsGroup, SettingsPage, ToggleRow } from './SettingsKit';

interface NotifPrefs {
  restTimer: boolean;
  workoutReminder: boolean;
  monthlyReport: boolean;
}

const DEFAULTS: NotifPrefs = {
  restTimer: true,
  workoutReminder: true,
  monthlyReport: false,
};

export function NotificationsSettingsScreen() {
  const { profile, saveProfile } = useUser();
  const prefs: NotifPrefs = {
    ...DEFAULTS,
    ...((profile?.preferences?.notifications as Partial<NotifPrefs>) ?? {}),
  };

  const set = (key: keyof NotifPrefs) => (value: boolean) => {
    void saveProfile({
      preferences: {
        ...(profile?.preferences ?? {}),
        notifications: { ...prefs, [key]: value },
      },
    });
  };

  return (
    <SettingsPage title="Notifications">
      <SettingsGroup footnote="Push delivery is coming soon — your preferences are saved and will apply automatically once it's live.">
        <ToggleRow
          label="Rest timer"
          sublabel="Alert when a rest period ends"
          value={prefs.restTimer}
          onValueChange={set('restTimer')}
        />
        <ToggleRow
          label="Workout reminder"
          sublabel="A nudge before your planned session"
          value={prefs.workoutReminder}
          onValueChange={set('workoutReminder')}
        />
        <ToggleRow
          label="Monthly report"
          sublabel="Your progress summary, once a month"
          value={prefs.monthlyReport}
          onValueChange={set('monthlyReport')}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

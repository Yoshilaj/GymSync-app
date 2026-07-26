import { Linking } from 'react-native';
import { APP_VERSION, SUPPORT_EMAIL } from '@/lib/appInfo';
import { SettingsGroup, SettingsPage, SettingsRow } from './SettingsKit';

function mail(subject: string) {
  const full = `${subject} — GymSync v${APP_VERSION}`;
  void Linking.openURL(
    `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(full)}`,
  );
}

export function InquiryScreen() {
  return (
    <SettingsPage title="Contact support">
      <SettingsGroup
        inset
        footnote={`Emails go to ${SUPPORT_EMAIL}. A real person usually replies within a day.`}
      >
        <SettingsRow
          label="Ask a question"
          sublabel="Anything about your plan, account, or the app"
          icon="chatbubble-ellipses-outline"
          chevron
          onPress={() => mail('Question')}
        />
        <SettingsRow
          label="Report a problem"
          sublabel="Something broken or not behaving right"
          icon="bug-outline"
          chevron
          onPress={() => mail('Problem report')}
        />
        <SettingsRow
          label="Share feedback"
          sublabel="Ideas and requests — we read all of them"
          icon="bulb-outline"
          chevron
          onPress={() => mail('Feedback')}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

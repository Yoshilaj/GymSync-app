import { View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { makeStyles, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import type { SettingsStackParamList } from '@/navigation/SettingsNavigator';
import { APP_NAME } from '@/lib/appInfo';
import { SettingsPage } from './SettingsKit';

type Rt = RouteProp<SettingsStackParamList, 'Legal'>;

const PRIVACY = [
  ['What we collect', `${APP_NAME} stores the account and profile details you provide, your workout plans and logged sets, and your conversations with the coach — so the app works across your devices.`],
  ['How it’s used', 'Your data personalizes your coaching and powers your progress views. We never sell it.'],
  ['AI processing', 'Messages you send the coach are processed by our AI providers to generate replies. Voice audio is transcribed in real time and not retained beyond the session.'],
  ['Your control', 'You can edit your profile anytime and permanently delete your account and all associated data from Account settings.'],
];

const TERMS = [
  ['Coaching is guidance, not medical advice', `${APP_NAME} provides general fitness guidance. Consult a professional before starting a program, and stop if you feel pain.`],
  ['Your responsibility', 'You’re responsible for training safely and within your limits. Use appropriate form and weights.'],
  ['Acceptable use', 'Don’t misuse the service or attempt to disrupt it for others.'],
  ['Changes', 'These terms may update as the app evolves; continued use means you accept the current version.'],
];

export function LegalScreen() {
  const styles = useStyles();
  const { params } = useRoute<Rt>();
  const isPrivacy = params.kind === 'privacy';
  const sections = isPrivacy ? PRIVACY : TERMS;

  return (
    <SettingsPage title={isPrivacy ? 'Privacy policy' : 'Terms of service'}>
      <View style={styles.body}>
        {sections.map(([heading, text]) => (
          <View key={heading} style={styles.section}>
            <AppText variant="h3">{heading}</AppText>
            <AppText variant="body" color="textSecondary">
              {text}
            </AppText>
          </View>
        ))}
        <AppText variant="caption" color="textTertiary" style={styles.note}>
          This is a plain-language summary. Full legal terms will be published
          before public release.
        </AppText>
      </View>
    </SettingsPage>
  );
}

const useStyles = makeStyles(() => ({
  body: { gap: spacing.lg, paddingTop: spacing.sm },
  section: { gap: spacing.xs },
  note: { marginTop: spacing.md },
}));

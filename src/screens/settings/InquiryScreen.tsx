import { Linking, View } from 'react-native';
import { makeStyles, spacing } from '@/theme';
import { AppText, Button, Card } from '@/components/ui';
import { SUPPORT_EMAIL } from '@/lib/appInfo';
import { SettingsPage } from './SettingsKit';

export function InquiryScreen() {
  const styles = useStyles();

  const email = () => {
    void Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('GymSync support')}`,
    );
  };

  return (
    <SettingsPage title="Inquiry" subtitle="We usually reply within a day">
      <Card style={styles.card}>
        <AppText variant="h3">Get in touch</AppText>
        <AppText variant="body" color="textSecondary">
          Questions, bugs, feature ideas — anything at all. Email us and a real
          person will get back to you.
        </AppText>
        <View style={styles.action}>
          <Button title="Email support" icon="mail" onPress={email} />
        </View>
        <AppText variant="caption" color="textTertiary" align="center">
          {SUPPORT_EMAIL}
        </AppText>
      </Card>
    </SettingsPage>
  );
}

const useStyles = makeStyles(() => ({
  card: { gap: spacing.sm },
  action: { marginTop: spacing.sm },
}));

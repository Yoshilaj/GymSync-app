import { Linking, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, spacing, useTheme } from '@/theme';
import { AppText } from '@/components/ui';
import type { SettingsStackParamList } from '@/navigation/SettingsNavigator';
import { APP_NAME } from '@/lib/appInfo';
import type { LegalBlock, LegalListItem } from '@/content/legal/types';
import { PRIVACY_POLICY_BLOCKS, PRIVACY_POLICY_EFFECTIVE_DATE } from '@/content/legal/privacyPolicy';
import { TERMS_OF_SERVICE_BLOCKS, TERMS_OF_SERVICE_EFFECTIVE_DATE } from '@/content/legal/termsOfService';
import { SettingsGroup, SettingsPage, SettingsRow } from './SettingsKit';

const HOSTED_URL = {
  privacy: 'https://gymsyncapp.me/privacy-policy',
  terms: 'https://gymsyncapp.me/terms-of-service',
} as const;

type Rt = RouteProp<SettingsStackParamList, 'Legal'>;

const PRIVACY_SUMMARY = [
  ['What we collect', `${APP_NAME} stores the account and profile details you provide, your workout plans and logged sets, and your conversations with the coach — so the app works across your devices.`],
  ['How it’s used', 'Your data personalizes your coaching and powers your progress views. We never sell it.'],
  ['AI processing', 'Messages you send the coach are processed by our AI providers to generate replies. Voice audio is transcribed in real time and not retained beyond the session.'],
  ['Your control', 'You can edit your profile anytime and permanently delete your account and all associated data from Account settings.'],
];

const TERMS_SUMMARY = [
  ['Coaching is guidance, not medical advice', `${APP_NAME} provides general fitness guidance. Consult a professional before starting a program, and stop if you feel pain.`],
  ['Your responsibility', 'You’re responsible for training safely and within your limits. Use appropriate form and weights.'],
  ['Acceptable use', 'Don’t misuse the service or attempt to disrupt it for others.'],
  ['Changes', 'These terms may update as the app evolves; continued use means you accept the current version.'],
];

function ListItemRow({ item }: { item: LegalListItem }) {
  const styles = useStyles();
  return (
    <View style={styles.listRow}>
      <View style={styles.bullet} />
      {typeof item === 'string' ? (
        <AppText variant="body" color="textSecondary" style={styles.listText}>
          {item}
        </AppText>
      ) : (
        <AppText variant="body" color="textSecondary" style={styles.listText}>
          <AppText variant="bodyMedium" color="textPrimary">
            {item.label}:{' '}
          </AppText>
          {item.text}
        </AppText>
      )}
    </View>
  );
}

/** Renders the word-for-word legal text — see src/content/legal/ for the source. */
function LegalDocumentBody({ blocks }: { blocks: LegalBlock[] }) {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <View style={styles.doc}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h':
            return (
              <AppText key={i} variant="h3" style={styles.heading}>
                {block.text}
              </AppText>
            );
          case 'h2':
            return (
              <AppText key={i} variant="bodyMedium" style={styles.subheading}>
                {block.text}
              </AppText>
            );
          case 'p':
            return (
              <AppText key={i} variant="body" color="textSecondary" style={styles.paragraph}>
                {block.text}
              </AppText>
            );
          case 'list':
            return (
              <View key={i} style={styles.list}>
                {block.items.map((item, j) => (
                  <ListItemRow key={j} item={item} />
                ))}
              </View>
            );
          case 'services':
            return (
              <View key={i} style={styles.services}>
                <SettingsGroup>
                  {block.items.map((service) => (
                    <SettingsRow
                      key={service.name}
                      label={service.name}
                      sublabel={service.purpose}
                      right={<Ionicons name="open-outline" size={16} color={colors.textTertiary} />}
                      onPress={() => void Linking.openURL(service.url)}
                    />
                  ))}
                </SettingsGroup>
              </View>
            );
        }
      })}
    </View>
  );
}

export function LegalScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { params } = useRoute<Rt>();
  const isPrivacy = params.kind === 'privacy';
  const summary = isPrivacy ? PRIVACY_SUMMARY : TERMS_SUMMARY;
  const blocks = isPrivacy ? PRIVACY_POLICY_BLOCKS : TERMS_OF_SERVICE_BLOCKS;
  const effectiveDate = isPrivacy ? PRIVACY_POLICY_EFFECTIVE_DATE : TERMS_OF_SERVICE_EFFECTIVE_DATE;

  return (
    <SettingsPage
      title={isPrivacy ? 'Privacy policy' : 'Terms of service'}
      // Pushed from the paywall modal there is no tab bar to clear.
      tabBarClearance={!params.fromModal}
    >
      <View style={styles.body}>
        {summary.map(([heading, text]) => (
          <View key={heading} style={styles.summarySection}>
            <AppText variant="bodyMedium">{heading}</AppText>
            <AppText variant="body" color="textSecondary">
              {text}
            </AppText>
          </View>
        ))}
        <AppText variant="caption" color="textTertiary">
          This is a plain-language summary. The full legal text follows below.
        </AppText>

        <View style={styles.divider} />

        <AppText variant="label" color="textTertiary">
          Full legal text
        </AppText>
        <AppText variant="caption" color="textTertiary">
          Effective {effectiveDate} · Last updated {effectiveDate}
        </AppText>

        <LegalDocumentBody blocks={blocks} />

        <SettingsRow
          label="Open in browser"
          sublabel={isPrivacy ? 'gymsyncapp.me/privacy-policy' : 'gymsyncapp.me/terms-of-service'}
          right={<Ionicons name="open-outline" size={18} color={colors.textTertiary} />}
          onPress={() =>
            void Linking.openURL(isPrivacy ? HOSTED_URL.privacy : HOSTED_URL.terms)
          }
        />
      </View>
    </SettingsPage>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  summarySection: { gap: spacing.xs },
  divider: { height: 1, backgroundColor: t.colors.border, marginVertical: spacing.sm },
  doc: { gap: 0 },
  heading: { marginTop: spacing.xl },
  subheading: { marginTop: spacing.lg },
  paragraph: { marginTop: spacing.sm },
  list: { marginTop: spacing.sm, gap: spacing.sm },
  listRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bullet: {
    width: spacing.xs,
    height: spacing.xs,
    borderRadius: spacing.xs / 2,
    backgroundColor: t.colors.textTertiary,
    // Optical center against the body variant's 24pt line height.
    marginTop: spacing.sm + spacing.xxs,
  },
  listText: { flex: 1 },
  services: { marginTop: spacing.md },
}));

import { Linking, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { makeStyles, spacing, useTheme } from '@/theme';
import { AppText } from '@/components/ui';
import { APP_VERSION, SOCIAL_LINKS } from '@/lib/appInfo';
import type { SettingsStackParamList } from '@/navigation/SettingsNavigator';
import { SettingsGroup, SettingsPage, SettingsRow } from './SettingsKit';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'AboutUs'>;

export function AboutUsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const nav = useNavigation<Nav>();

  return (
    <SettingsPage title="About us">
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Ionicons name="barbell" size={28} color={colors.textInverse} />
        </View>
        <AppText variant="h2">GymSync</AppText>
        <AppText variant="caption" color="textSecondary">
          Your AI training partner
        </AppText>
      </View>

      <SettingsGroup title="Legal">
        <SettingsRow
          label="Privacy policy"
          chevron
          onPress={() => nav.navigate('Legal', { kind: 'privacy' })}
        />
        <SettingsRow
          label="Terms of service"
          chevron
          onPress={() => nav.navigate('Legal', { kind: 'terms' })}
        />
        <SettingsRow label="Version" value={APP_VERSION} />
      </SettingsGroup>

      <SettingsGroup title="Follow us" inset>
        {SOCIAL_LINKS.map((s) => (
          <SettingsRow
            key={s.label}
            label={s.label}
            icon={s.icon as keyof typeof Ionicons.glyphMap}
            right={<Ionicons name="open-outline" size={18} color={colors.textTertiary} />}
            onPress={() => void Linking.openURL(s.url)}
          />
        ))}
      </SettingsGroup>
    </SettingsPage>
  );
}

const useStyles = makeStyles((t) => ({
  brand: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  logo: {
    width: 64,
    height: 64,
    borderRadius: spacing.lg,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
}));

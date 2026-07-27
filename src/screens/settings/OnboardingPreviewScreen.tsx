/**
 * Dev-only: walk the real onboarding flow without spending an account.
 *
 * Mounts the actual OnboardingNavigator in preview mode, so what you see is
 * the shipping flow — not a mock. Both profile writes are no-ops and plan
 * generation is stubbed, so nothing here reaches the server.
 */
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingNavigator } from '@/navigation/OnboardingNavigator';
import { AppText } from '@/components/ui';
import { makeStyles, spacing, useTheme } from '@/theme';

export function OnboardingPreviewScreen() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.root}>
      <View style={[styles.banner, { paddingTop: insets.top + spacing.xs }]}>
        <AppText variant="caption" color="textInverse">
          Preview — nothing is saved
        </AppText>
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close onboarding preview"
        >
          <Ionicons name="close" size={20} color={colors.textInverse} />
        </Pressable>
      </View>
      <View style={styles.flow}>
        <OnboardingNavigator preview />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.bg },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: t.colors.live,
  },
  flow: { flex: 1 },
}));

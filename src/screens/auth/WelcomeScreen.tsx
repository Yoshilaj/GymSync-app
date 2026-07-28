/**
 * The first screen of the app.
 *
 * Before this existed, a brand-new user's first impression was a sign-in form —
 * a password field explains nothing about why GymSync is different. It used to
 * lead with a breathing mic and the pitch itself; now the pitch has a whole
 * carousel of its own one tap away, so this screen does the quieter job of
 * simply being the brand: the mark, the name, one sentence, two ways in.
 *
 * Full-bleed brand blue, matching the launch screen exactly — so the hold while
 * the app wakes up and this screen are one continuous surface, and the buttons
 * simply arrive on it rather than the whole background changing underneath.
 *
 * The breathing mark moved to the carousel's first page, where "a coach that
 * listens" is the actual claim being made and the motion means something.
 */
import { View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { AppText, Button, Entering, Screen } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { makeStyles, spacing, useTheme } from '@/theme';

type Nav = NativeStackNavigationProp<AuthStackParamList>;

export function WelcomeScreen() {
  const nav = useNavigation<Nav>();
  const { colors } = useTheme();
  const styles = useStyles();
  const focused = useIsFocused();

  return (
    <Screen
      fill="brand"
      tabBarClearance={false}
      footer={
        <View style={styles.footer}>
          <Button
            title="Get started"
            variant="onBrand"
            onPress={() => nav.navigate('Intro')}
          />
          <Button
            title="Log in"
            variant="onBrandGhost"
            onPress={() => nav.navigate('SignIn')}
          />
        </View>
      }
    >
      {/* Dark glyphs would be illegible on the brand fill. */}
      {focused && <StatusBar style="light" />}

      <View style={styles.body}>
        <Entering index={0}>
          <View style={styles.lockup}>
            <Logo size={132} color={colors.textInverse} />
            <AppText variant="display" align="center" color={colors.textInverse}>
              GymSync
            </AppText>
          </View>
        </Entering>

        <Entering index={1}>
          <AppText
            variant="body"
            align="center"
            color={colors.textInverse}
            style={styles.quiet}
          >
            A coach that listens while you train.
          </AppText>
        </Entering>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  // Mark and wordmark are one object, so they sit closer to each other than
  // either does to the sentence underneath.
  lockup: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Secondary text on a brand fill steps back with opacity rather than a
  // dimmer colour — every text token is tuned for light/dark surfaces, not blue.
  quiet: { opacity: 0.82 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
}));

/**
 * What you see while the app wakes up.
 *
 * The native launch screen is a flat fill of the same brand blue, so this
 * mounting on top is invisible — the colour never changes, the mark just
 * arrives. That blue comes from the expo-splash-screen plugin config in
 * app.json (don't remove the plugin thinking it's unused: without it, prebuild
 * generates a WHITE storyboard and every cold start flashes white → blue.
 * Build 3 shipped that way, which is why Apple's 2.1a rejection screenshot was
 * a white screen rather than a blue one).
 *
 * Uses `gradients.brand` rather than a theme surface on purpose: a launch
 * screen is brand, not chrome, so it stays blue in dark mode too.
 */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { makeStyles, spacing, useTheme } from '@/theme';

interface Props {
  /**
   * Off during the font gate — Inter hasn't loaded yet, so a wordmark there
   * would render in the system face and then snap. The mark alone is safe.
   */
  showWordmark?: boolean;
}

export function LaunchScreen({ showWordmark = true }: Props) {
  const { colors, gradients } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const fade = reduceMotion ? undefined : FadeIn.duration(280);

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.brand} style={StyleSheet.absoluteFill} />
      {/* Dark glyphs would be illegible on the brand fill. */}
      <StatusBar style="light" />

      <Animated.View entering={fade} style={styles.mark}>
        <Logo size={168} color={colors.textInverse} />
      </Animated.View>

      <View
        style={[
          styles.wordmark,
          { paddingBottom: insets.bottom + spacing.xxxl },
        ]}
      >
        {showWordmark ? (
          <Animated.View entering={fade}>
            <AppText variant="display" color="textInverse" align="center">
              GymSync
            </AppText>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { flex: 1 },
  mark: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    // Reserved whether or not the wordmark is showing, so the mark doesn't
    // shift when fonts land mid-launch.
    minHeight: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
}));

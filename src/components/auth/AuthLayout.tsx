import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from '@/components/ui';
import { Logo } from '@/components/Logo';

// Tall enough that the back chevron (insets.top + 40pt) sits fully on blue —
// the sheet pulls up over the header's bottom 32pt, and at 120 the sheet's
// white corner was swallowing the chevron.
const HEADER_H = 140;

interface Props {
  children: ReactNode;
  title: string;
  subtitle?: string;
  /** Renders a top-left back chevron (auth stack hides native headers). */
  onBack?: () => void;
}

/**
 * Rings bleeding off the header's top-left corner — the brand's ring language
 * (RestRing, the breathing coach orb) doing the job of the reference design's
 * wave pattern. Pure decoration, so it's aria-hidden by omission.
 */
function HeaderRings({ color }: { color: string }) {
  const rings = [56, 104, 152, 200, 248];
  return (
    <Svg
      width={320}
      height={HEADER_H + 80}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {rings.map((r) => (
        <Circle
          key={r}
          cx={40}
          cy={10}
          r={r}
          stroke={color}
          strokeOpacity={0.1}
          strokeWidth={8}
          fill="none"
        />
      ))}
    </Svg>
  );
}

/**
 * Shared scaffold for the logged-out form screens: brand-blue header with the
 * ring motif, then a white sheet with big rounded shoulders carrying a
 * centered title and the form. The sheet is the page — the header is just
 * enough brand to remember whose form this is.
 */
export function AuthLayout({ children, title, subtitle, onBack }: Props) {
  const { colors, gradients } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const { height } = useWindowDimensions();

  return (
    <View style={styles.root}>
      {/* Dark glyphs would be illegible on the brand fill. */}
      {focused && <StatusBar style="light" />}

      <LinearGradient colors={gradients.brand} style={styles.header}>
        <HeaderRings color={colors.textInverse} />
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [
              styles.back,
              { top: insets.top + spacing.xs },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textInverse} />
          </Pressable>
        ) : null}
      </LinearGradient>

      <View style={styles.sheet}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Math.max(insets.bottom, spacing.lg) },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            // Content is budgeted to fit one screen; only the keyboard should
            // ever make this scroll.
            bounces={false}
          >
            <View style={styles.headerBlock}>
              {/* The mark above a plain-language title — identity carried by
                  one small emblem instead of decoration. */}
              <Logo size={40} />
              <AppText variant="h1" align="center" style={styles.title}>
                {title}
              </AppText>
              {subtitle ? (
                <AppText variant="body" color="textSecondary" align="center">
                  {subtitle}
                </AppText>
              ) : null}
            </View>
            {children}
            {/* Keep short forms from looking beached on tall screens. */}
            <View style={{ minHeight: height * 0.02 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.card },
  flex: { flex: 1 },
  header: {
    height: HEADER_H,
    overflow: 'hidden',
  },
  back: {
    position: 'absolute',
    left: layout.SCREEN_H_PADDING,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  pressed: { opacity: 0.6 },
  sheet: {
    flex: 1,
    backgroundColor: t.colors.card,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    // Pulled up over the header so the shoulders round against blue.
    marginTop: -radius.xxl,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  headerBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  title: { marginTop: spacing.sm },
}));

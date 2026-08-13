import { ReactNode } from 'react';
import { Platform, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { glassAvailable } from '@/lib/glass';
import { layout, makeStyles, useTheme } from '@/theme';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The floating tab bar's surface, best-available per platform:
 * - iOS 26+: native liquid glass (UIVisualEffectView via expo-glass-effect).
 * - Older iOS: frosted blur + a white veil so labels stay legible.
 * - Android: solid card (BlurView there is costly and inconsistent).
 *
 * The shadow lives on the outer wrapper — iOS drops shadows on views that
 * clip their children, so the rounded/clipped surface can't carry it.
 */
export function TabBarSurface({ children, style }: Props) {
  const { scheme } = useTheme();
  const styles = useStyles();
  if (Platform.OS === 'ios' && glassAvailable()) {
    return (
      <View style={[styles.glassShadow, style]}>
        <GlassView glassEffectStyle="clear" isInteractive style={styles.surface}>
          {children}
        </GlassView>
      </View>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.shadow, style]}>
        <BlurView
          tint={scheme === 'dark' ? 'dark' : 'light'}
          intensity={80}
          style={styles.surface}
        >
          <View style={[StyleSheet.absoluteFill, styles.frostVeil]} />
          {children}
        </BlurView>
      </View>
    );
  }

  return (
    <View style={[styles.shadow, style]}>
      <View style={[styles.surface, styles.solid]}>{children}</View>
    </View>
  );
}

/**
 * The active-tab highlight: an accent-tinted glass pill riding on the clear
 * bar — the same interactive glass material as the system toggle knob, so it
 * responds while held. Falls back to a soft accent pill.
 */
export function GlassLozenge({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const lozengeStyles = useLozengeStyles();
  if (Platform.OS === 'ios' && glassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        tintColor={colors.accentSoft}
        style={[lozengeStyles.base, style]}
      />
    );
  }
  return <View style={[lozengeStyles.base, lozengeStyles.fallback, style]} />;
}

const useLozengeStyles = makeStyles((t) => ({
  base: {
    borderRadius: layout.TAB_BAR_RADIUS,
    overflow: 'hidden',
  },
  fallback: { backgroundColor: t.colors.accentSoft },
}));

const useStyles = makeStyles((t) => ({
  shadow: {
    ...t.shadows.lg,
    borderRadius: layout.TAB_BAR_RADIUS,
  },
  // Clear glass should read as glass, not a floating card — lighter shadow.
  glassShadow: {
    ...t.shadows.md,
    borderRadius: layout.TAB_BAR_RADIUS,
  },
  surface: {
    borderRadius: layout.TAB_BAR_RADIUS,
    overflow: 'hidden',
    flex: 1,
  },
  // Frosted veil over the blur so labels stay legible — light in light mode,
  // a translucent dark-navy (the dark card color) in dark mode.
  frostVeil: {
    backgroundColor:
      t.scheme === 'dark' ? 'rgba(22,35,58,0.70)' : 'rgba(255,255,255,0.70)',
  },
  solid: { backgroundColor: t.colors.card },
}));

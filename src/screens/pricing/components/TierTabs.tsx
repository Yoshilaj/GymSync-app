/**
 * Free / Pro / Premium, as a liquid-glass pill straddling the hero's horizon.
 *
 * The track is glass because there is real artwork behind it to refract —
 * the one honest glassmorphism placement on this screen. It follows
 * TabBarSurface's three-tier fallback exactly: native GlassView on iOS 26+,
 * BlurView + a frost veil on older iOS, a solid card on Android (where blur
 * is costly and inconsistent — the white-pill-over-artwork look is a design,
 * not a degradation). The veil is thinner than the tab bar's 0.70: that one
 * is armor over arbitrary scrolling content; this sits over our own quiet
 * sky, and 0.70 would erase the glass entirely.
 *
 * The sliding indicator wears the same gradient as the primary Button —
 * the selected tier and the CTA that buys it are the same decision, so they
 * share a skin. It slides (transform only, ~220ms ease-out) rather than
 * teleporting; under Reduce Motion it snaps.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/ui';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { ALL_TIERS, TIERS, type TierId } from '../catalog';

/** Track inner padding — the gutter the indicator floats in. */
const PAD = spacing.xs;
/** Exported so PricingScreen can overlap the hero by exactly half of it. */
export const TRACK_HEIGHT = 44 + PAD * 2;

// Evaluated once — cheap, and it can't change at runtime.
const glassAvailable = isLiquidGlassAvailable();

interface Props {
  value: TierId;
  onChange: (tier: TierId) => void;
  disabled?: boolean;
}

export function TierTabs({ value, onChange, disabled = false }: Props) {
  const { gradients } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();

  const [cellWidth, setCellWidth] = useState(0);
  const x = useSharedValue(0);
  const settledOnce = useRef(false);
  const index = ALL_TIERS.indexOf(value);

  useEffect(() => {
    if (cellWidth <= 0) return;
    const target = index * cellWidth;
    // First position (and any Reduce Motion move) lands without travel — the
    // pill must not fly in from x:0 on mount when Pro is preselected.
    if (!settledOnce.current || reduceMotion) {
      x.value = target;
      settledOnce.current = true;
      return;
    }
    x.value = withTiming(target, {
      duration: 220,
      easing: Easing.out(Easing.quad),
    });
  }, [index, cellWidth, reduceMotion, x]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    setCellWidth((e.nativeEvent.layout.width - PAD * 2) / ALL_TIERS.length);
  };

  return (
    <View
      style={[styles.shadow, disabled && styles.disabled]}
      pointerEvents={disabled ? 'none' : 'auto'}
    >
      <TrackSurface>
        <View
          style={styles.track}
          onLayout={onLayout}
          accessibilityRole="radiogroup"
        >
          {cellWidth > 0 ? (
            <Animated.View
              style={[styles.indicator, { width: cellWidth }, indicatorStyle]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={gradients.button}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.indicatorFill}
              />
            </Animated.View>
          ) : null}

          {ALL_TIERS.map((id) => {
            const selected = id === value;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  if (selected) return;
                  void Haptics.selectionAsync();
                  onChange(id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${TIERS[id].name} plan`}
                style={styles.cell}
              >
                <AppText
                  variant="bodyMedium"
                  color={selected ? 'textInverse' : 'textSecondary'}
                >
                  {TIERS[id].name}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </TrackSurface>
    </View>
  );
}

/** TabBarSurface's three-tier glass fallback, sized for a segmented pill. */
function TrackSurface({ children }: { children: ReactNode }) {
  const { scheme } = useTheme();
  const styles = useStyles();

  if (Platform.OS === 'ios' && glassAvailable) {
    return (
      <GlassView glassEffectStyle="clear" style={styles.surface}>
        {children}
      </GlassView>
    );
  }
  if (Platform.OS === 'ios') {
    return (
      <BlurView
        tint={scheme === 'dark' ? 'dark' : 'light'}
        intensity={80}
        style={styles.surface}
      >
        <View style={[StyleSheet.absoluteFill, styles.veil]} />
        {children}
      </BlurView>
    );
  }
  return <View style={[styles.surface, styles.solid]}>{children}</View>;
}

const useStyles = makeStyles((t) => ({
  // Shadow on the wrapper — iOS drops shadows on views that clip children.
  shadow: { ...t.shadows.sm, borderRadius: radius.pill },
  disabled: { opacity: 0.4 },
  surface: { borderRadius: radius.pill, overflow: 'hidden' },
  // 0.50/0.55, not the tab bar's 0.70 — see header. Floor 0.45 for AA on the
  // textSecondary labels over the pale sky.
  veil: {
    backgroundColor:
      t.scheme === 'dark' ? 'rgba(22,35,58,0.55)' : 'rgba(255,255,255,0.50)',
  },
  solid: { backgroundColor: t.colors.card },
  track: { flexDirection: 'row', padding: PAD },
  indicator: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: radius.pill,
    ...t.shadows.sm,
  },
  indicatorFill: { flex: 1, borderRadius: radius.pill },
  cell: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

import { ReactNode, useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { layout, makeStyles, spacing, useTheme, type GradientKey } from '@/theme';
import { useTabBarClearance } from '@/hooks';

interface Props {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  /** Wrap content in a KeyboardAvoidingView (chat-style screens). */
  keyboard?: boolean;
  /**
   * Pull-to-refresh. Only meaningful with `scroll`.
   *
   * Lives here rather than in each screen so there is one implementation and one
   * set of theme colours: the app previously had no RefreshControl anywhere, so
   * a fetch that failed left the user with no way to retry short of killing the
   * app. Return a promise and the spinner clears when it settles.
   */
  onRefresh?: () => Promise<unknown> | void;
  /** Pinned below the (scrolling) content — input bars, end buttons. */
  footer?: ReactNode;
  /** Soft blue gradient wash instead of the flat background. */
  wash?: boolean;
  /**
   * Any gradient as a full-bleed background — `fill="brand"` for a branded
   * surface. Takes precedence over `wash`. Remember the content sitting on it
   * needs inverse colours and its own light status bar.
   */
  fill?: GradientKey;
  /** Pad scroll content so it clears the floating tab bar (off for non-tab screens). */
  tabBarClearance?: boolean;
  /**
   * Override the scroll content's bottom padding. Only useful with
   * `tabBarClearance={false}`, where the default `spacing.xxxl` is generous
   * breathing room for a scrolling page but pure dead space on a screen
   * designed to fit exactly (see the paywall).
   */
  padBottom?: number;
}

/**
 * The one screen wrapper: safe area, background, uniform gutters, optional
 * scroll / keyboard avoidance / pinned footer.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top', 'left', 'right'],
  keyboard = false,
  footer,
  onRefresh,
  wash = false,
  fill,
  tabBarClearance = true,
  padBottom,
}: Props) {
  const { gradients, colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    if (!onRefresh) return;
    setRefreshing(true);
    // Settled either way: a refresh that throws must still clear the spinner,
    // or the control sticks and the screen looks permanently busy.
    void Promise.resolve(onRefresh()).finally(() => setRefreshing(false));
  }, [onRefresh]);
  const styles = useStyles();
  const clearance = useTabBarClearance();
  const insets = useSafeAreaInsets();
  const bottomPad =
    padBottom ?? (tabBarClearance ? clearance.scroll : spacing.xxxl);
  // A pinned footer must never sit under the floating tab bar (tab screens) or
  // the home indicator (modal/pushed screens outside the tabs).
  const footerPad = tabBarClearance
    ? clearance.pinned
    : Math.max(insets.bottom, spacing.md);

  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        { paddingBottom: bottomPad },
        padded && styles.padded,
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textTertiary}
            colors={[colors.accent]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded]}>{children}</View>
  );

  let body = (
    <>
      {inner}
      {footer != null ? (
        <View style={{ paddingBottom: footerPad }}>{footer}</View>
      ) : null}
    </>
  );

  if (keyboard) {
    body = (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={layout.HEADER_KEYBOARD_OFFSET}
      >
        {body}
      </KeyboardAvoidingView>
    );
  }

  const gradient: GradientKey | undefined = fill ?? (wash ? 'screenWash' : undefined);

  const safe = (
    <SafeAreaView
      style={[styles.flex, !gradient && styles.bg]}
      edges={edges}
    >
      {body}
    </SafeAreaView>
  );

  if (gradient) {
    return (
      <LinearGradient colors={gradients[gradient]} style={styles.flex}>
        {safe}
      </LinearGradient>
    );
  }
  return safe;
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  bg: { backgroundColor: t.colors.bg },
  padded: { paddingHorizontal: layout.SCREEN_H_PADDING },
}));

import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, layout, spacing } from '@/theme';
import { useTabBarClearance } from '@/hooks';

interface Props {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  /** Wrap content in a KeyboardAvoidingView (chat-style screens). */
  keyboard?: boolean;
  /** Pinned below the (scrolling) content — input bars, end buttons. */
  footer?: ReactNode;
  /** Soft blue gradient wash instead of the flat background. */
  wash?: boolean;
  /** Pad scroll content so it clears the floating tab bar (off for non-tab screens). */
  tabBarClearance?: boolean;
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
  wash = false,
  tabBarClearance = true,
}: Props) {
  const clearance = useTabBarClearance();
  const bottomPad = tabBarClearance ? clearance.scroll : spacing.xxxl;

  const inner = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        { paddingBottom: bottomPad },
        padded && styles.padded,
      ]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded]}>{children}</View>
  );

  let body = (
    <>
      {inner}
      {footer}
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

  const safe = (
    <SafeAreaView
      style={[styles.flex, !wash && styles.bg]}
      edges={edges}
    >
      {body}
    </SafeAreaView>
  );

  if (wash) {
    return (
      <LinearGradient colors={gradients.screenWash} style={styles.flex}>
        {safe}
      </LinearGradient>
    );
  }
  return safe;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bg: { backgroundColor: colors.bg },
  padded: { paddingHorizontal: layout.SCREEN_H_PADDING },
});

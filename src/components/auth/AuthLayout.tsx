import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients, shadows, spacing } from '@/theme';
import { AppText } from '@/components/ui';

interface Props {
  children: ReactNode;
  title?: string;
  caption?: string;
  /** Renders a top-left back chevron (auth stack hides native headers). */
  onBack?: () => void;
}

/**
 * Shared scaffold for the logged-out screens: brand mark, centered form,
 * keyboard-safe scrolling. Mirrors the Screen wrapper's role for the app side.
 */
export function AuthLayout({
  children,
  title = 'GymSync',
  caption = 'Your AI training partner',
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      {onBack && (
        // Absolute children ignore the safe-area padding, so offset manually.
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={[styles.back, { top: insets.top + spacing.sm }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
      )}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandBlock}>
            <View style={styles.logoShadow}>
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.logo}
              >
                <Ionicons name="sparkles" size={28} color={colors.textInverse} />
              </LinearGradient>
            </View>
            <AppText variant="display" align="center">
              {title}
            </AppText>
            <AppText variant="caption" align="center">
              {caption}
            </AppText>
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  back: {
    position: 'absolute',
    left: spacing.lg,
    zIndex: 2,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  brandBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xxl,
  },
  logoShadow: {
    ...shadows.glow,
    borderRadius: 32,
    marginBottom: spacing.md,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { ReactNode } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, spacing, useTheme } from '@/theme';
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
  const { colors } = useTheme();
  const styles = useStyles();

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
              <Image
                source={require('../../../assets/icon.png')}
                style={styles.logo}
              />
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

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.bg },
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
    ...t.shadows.glow,
    // iOS app-icon squircle ratio (~22.5% of size) so the mark reads as the icon.
    borderRadius: 14,
    marginBottom: spacing.md,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 14,
  },
}));

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import { AnimatedPressable, AppText, Entering } from '@/components/ui';

type Provider = 'Apple' | 'Google';

/** "or continue with" separator between the email form and the social buttons. */
export function OrDivider() {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <AppText variant="caption" color="textTertiary">
        or continue with
      </AppText>
      <View style={styles.dividerLine} />
    </View>
  );
}

/**
 * Shortcut sign-in buttons. Visual-only for now — real OAuth arrives with the
 * WorkOS integration, so taps surface a friendly inline notice instead.
 */
export function SocialAuthButtons() {
  const [notice, setNotice] = useState<Provider | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = (provider: Provider) => {
    if (timer.current) clearTimeout(timer.current);
    setNotice(provider);
    timer.current = setTimeout(() => setNotice(null), 3000);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <View style={styles.stack}>
      <AnimatedPressable style={styles.apple} onPress={() => announce('Apple')}>
        <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
        <AppText variant="button" color="#FFFFFF">
          Continue with Apple
        </AppText>
      </AnimatedPressable>

      <AnimatedPressable style={styles.google} onPress={() => announce('Google')}>
        <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
        <AppText variant="button" color="textPrimary">
          Continue with Google
        </AppText>
      </AnimatedPressable>

      {notice && (
        <Entering>
          <View style={styles.notice}>
            <Ionicons name="time-outline" size={15} color={colors.accentText} />
            <AppText variant="caption" color="accentText" style={styles.noticeText}>
              {notice} sign-in is coming soon. Use email for now.
            </AppText>
          </View>
        </Entering>
      )}
    </View>
  );
}

const row = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  gap: spacing.sm,
  minHeight: 52,
  borderRadius: radius.md,
};

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  // Apple HIG requires the black button — deliberate hex, not a theme token.
  apple: { ...row, backgroundColor: '#000000' },
  google: {
    ...row,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  noticeText: { flex: 1 },
});

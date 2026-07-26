import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AnimatedPressable, AppText, Entering } from '@/components/ui';

type Provider = 'Apple' | 'Google';

/** "or continue with" separator between the email form and the social buttons. */
export function OrDivider() {
  const styles = useStyles();
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
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const dark = scheme === 'dark';
  // Brand button content colors follow each brand's dark spec (deliberate hex).
  const appleContent = dark ? '#000000' : '#FFFFFF';
  const googleContent = dark ? '#E3E3E3' : colors.textPrimary;
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
        <Ionicons name="logo-apple" size={20} color={appleContent} />
        <AppText variant="button" color={appleContent}>
          Continue with Apple
        </AppText>
      </AnimatedPressable>

      <AnimatedPressable style={styles.google} onPress={() => announce('Google')}>
        <Ionicons name="logo-google" size={18} color={googleContent} />
        <AppText variant="button" color={googleContent}>
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

const useStyles = makeStyles((t) => ({
  stack: { gap: spacing.sm },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: t.colors.border },
  // Brand buttons per each brand's OWN light/dark specs (deliberate hex, not
  // theme tokens): Apple = black-on-light / white-on-dark; Google = white with
  // border on light / #131314 dark button.
  apple: {
    ...row,
    backgroundColor: t.scheme === 'dark' ? '#FFFFFF' : '#000000',
  },
  google: {
    ...row,
    backgroundColor: t.scheme === 'dark' ? '#131314' : '#FFFFFF',
    borderWidth: 1,
    borderColor: t.scheme === 'dark' ? '#8E918F' : t.colors.border,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: t.colors.accentSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  noticeText: { flex: 1 },
}));

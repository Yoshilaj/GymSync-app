import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AnimatedPressable, AppText, Entering } from '@/components/ui';
import { isAppleAvailable, isGoogleConfigured, signInWithProvider } from '@/auth/social';

type Provider = 'Apple' | 'Google';

/** "OR" separator between the email form and the social buttons. */
export function OrDivider() {
  const styles = useStyles();
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <AppText variant="label" color="textTertiary">
        or
      </AppText>
      <View style={styles.dividerLine} />
    </View>
  );
}

/**
 * Shortcut sign-in buttons — real now, not decoration. A tap runs the native
 * credential sheet and hands the resulting ID token to Supabase (src/auth/social.ts);
 * success flips the auth gate on its own, so there is nothing to do here but
 * surface a failure.
 *
 * A provider that isn't available on this platform, or isn't configured in this
 * build, is not rendered at all. Showing a button that cannot work is what this
 * component used to do, and it's the kind of thing App Review rejects.
 */
export function SocialAuthButtons() {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const dark = scheme === 'dark';
  // Brand button content colors follow each brand's dark spec (deliberate hex).
  const appleContent = dark ? '#000000' : '#FFFFFF';
  const googleContent = dark ? '#E3E3E3' : colors.textPrimary;
  const [pending, setPending] = useState<Provider | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = (message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setNotice(message);
    timer.current = setTimeout(() => setNotice(null), 4000);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const run = async (provider: Provider) => {
    // One flow at a time: a second native sheet over the first is a dead end
    // on iOS, and a double-tap is easy on a pill this size.
    if (pending) return;
    setPending(provider);
    setNotice(null);
    const { error, cancelled } = await signInWithProvider(
      provider === 'Apple' ? 'apple' : 'google',
    );
    setPending(null);
    // Backing out of the sheet is a decision, not a failure. Say nothing.
    if (cancelled) return;
    if (error) announce(error);
    // On success the session lands and RootGate swaps the screen out from under us.
  };

  return (
    <View style={styles.stack}>
      {/* Labelled full-width pills. The pill CTA above and the OR divider keep
          the hierarchy honest: these read as an alternative, not the pitch. */}
      {isAppleAvailable && (
        <AnimatedPressable
          style={[styles.provider, styles.apple, pending === 'Google' && styles.dimmed]}
          onPress={() => void run('Apple')}
          disabled={pending !== null}
          accessibilityRole="button"
          accessibilityLabel="Continue with Apple"
          accessibilityState={{ disabled: pending !== null, busy: pending === 'Apple' }}
        >
          {pending === 'Apple' ? (
            <ActivityIndicator size="small" color={appleContent} />
          ) : (
            <Ionicons name="logo-apple" size={20} color={appleContent} />
          )}
          <AppText variant="button" color={appleContent}>
            Continue with Apple
          </AppText>
        </AnimatedPressable>
      )}

      {isGoogleConfigured && (
        <AnimatedPressable
          style={[styles.provider, styles.google, pending === 'Apple' && styles.dimmed]}
          onPress={() => void run('Google')}
          disabled={pending !== null}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          accessibilityState={{ disabled: pending !== null, busy: pending === 'Google' }}
        >
          {pending === 'Google' ? (
            <ActivityIndicator size="small" color={googleContent} />
          ) : (
            <Ionicons name="logo-google" size={18} color={googleContent} />
          )}
          <AppText variant="button" color={googleContent}>
            Continue with Google
          </AppText>
        </AnimatedPressable>
      )}

      {notice && (
        <Entering>
          <View style={styles.notice}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.accentText} />
            <AppText variant="caption" color="accentText" style={styles.noticeText}>
              {notice}
            </AppText>
          </View>
        </Entering>
      )}
    </View>
  );
}

/** True when at least one provider will actually render — lets a screen skip the
 * "or" divider rather than leave it hanging over nothing. */
export const hasSocialAuth = isAppleAvailable || isGoogleConfigured;

const useStyles = makeStyles((t) => ({
  stack: { gap: spacing.md },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.pill,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    // xl clears the primary CTA's glow while keeping the sheet on one screen.
    marginVertical: spacing.xl,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: t.colors.border },
  // Brand buttons per each brand's OWN light/dark specs (deliberate hex, not
  // theme tokens): Apple = black-on-light / white-on-dark; Google = white with
  // border on light / #131314 dark button.
  apple: {
    backgroundColor: t.scheme === 'dark' ? '#FFFFFF' : '#000000',
  },
  google: {
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
  // The idle provider recedes while the other one's sheet is up.
  dimmed: { opacity: 0.5 },
}));

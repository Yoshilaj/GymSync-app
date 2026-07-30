/**
 * The delete-account confirmation — a dialog over Account settings, not a page
 * of its own.
 *
 * Deleting an account is one decision, and a pushed screen framed it as a
 * destination: a header, a back chevron, a scroll view, and half a screen of
 * air around three sentences. A dialog says the same thing without pretending
 * there's anywhere to go — the settings page stays visible behind the scrim, so
 * cancelling puts you back exactly where you were.
 *
 * It carries the four things that disappear as a compact list rather than
 * "you will lose all of your data": the generic sentence is the one thing every
 * delete dialog says, and it's the one thing that tells the reader nothing.
 *
 * RN `Modal` rather than an absolutely-positioned overlay: the tab bar floats
 * above screen content, so an in-screen scrim would leave it sitting on top,
 * lit, while everything else dimmed.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { deleteAccount } from '@/api/account';
import { useBilling } from '@/billing/BillingProvider';
import { TIERS } from '@/screens/pricing/catalog';

/**
 * What the cascade removes. One clause each — a dialog is read at a glance, so
 * anything that wraps to a second line is too long for this list.
 */
const ERASED: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'person-outline', label: 'Profile, goals, and coach' },
  { icon: 'calendar-outline', label: 'Every workout plan' },
  { icon: 'barbell-outline', label: 'All logged sets and records' },
  { icon: 'chatbubble-ellipses-outline', label: 'Chat and voice history' },
];

/**
 * Dialog proportions, not a sheet: capped so it stays an object floating on the
 * settings page instead of a panel spanning it. ~306pt of text column at the
 * 24pt inset, which is the budget every line of copy in here is written to —
 * nothing in this card is allowed to wrap, including at the 1.2× Dynamic Type
 * ceiling.
 */
const CARD_MAX = 360;
const WELL = 68;
const BADGE = 26;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function DeleteAccountDialog({ visible, onClose }: Props) {
  const { entitlement, manage } = useBilling();
  // Apple's guidance asks for the date, not just the warning — "you'll keep
  // being charged" lands very differently with "next on 30 Aug 2026" beside it.
  const renewsOn = entitlement.renewsAt
    ? new Date(entitlement.renewsAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;
  const { colors } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { getToken, signOut } = useAuth();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal's own `fade` covers the scrim; this is the card's lift on top of it.
  //
  // Rewound and replayed on open, and deliberately NOT reset on close: leaving
  // it at 1 lets Modal's fade carry the whole dialog out. Zeroing it here would
  // snap the card away while the scrim was still dissolving.
  const enter = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    enter.value = 0;
    enter.value = withTiming(1, {
      duration: reduceMotion ? 0 : 200,
      easing: Easing.out(Easing.quad),
    });
  }, [visible, reduceMotion, enter]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.94 + 0.06 * enter.value }],
  }));

  // A dismissed dialog must not keep a stale error for the next time it opens.
  const dismiss = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const submit = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(await getToken());
      await signOut(); // the auth gate swaps to the sign-in flow
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : 'Could not delete account.');
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.root}>
        {/* Tap-outside-to-cancel. Behind the card, so it costs the card no
            touches; disabled mid-request, when there is nothing to cancel. */}
        <Pressable
          style={styles.scrim}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        />

        <Animated.View
          style={[
            styles.card,
            { maxWidth: Math.min(CARD_MAX, width - spacing.xl * 2) },
            cardStyle,
          ]}
          accessibilityViewIsModal
        >
          {/* The lockup: a person going away, with the irreversibility badged
              onto it. One drawn object rather than a bare warning triangle,
              which is the glyph every alert in the world already uses. */}
          <View style={styles.well}>
            <Ionicons name="person" size={32} color={colors.textTertiary} />
            <View style={styles.badge}>
              <Ionicons name="close" size={16} color={colors.textInverse} />
            </View>
          </View>

          {/* The centred pair: what this is, and the one fact that matters.
              Both hold one line — the sentence that used to carry the lead-in
              to the list ("…You'll permanently lose:") broke across two and
              took the rag with it. The list introduces itself instead. */}
          <AppText variant="h2" align="center">
            Delete your account
          </AppText>
          <AppText
            variant="body"
            color="textSecondary"
            align="center"
            style={styles.lead}
          >
            This can't be undone.
          </AppText>

          {/* From here down the card is left-aligned: a list and its caveat are
              read down a left edge, and centring them left the eye no column. */}
          <AppText variant="label" color="textTertiary" style={styles.eyebrow}>
            What you'll lose
          </AppText>

          <View style={styles.list}>
            {ERASED.map((item) => (
              <View key={item.label} style={styles.item}>
                <Ionicons name={item.icon} size={20} color={colors.textSecondary} />
                <AppText variant="body" style={styles.itemLabel}>
                  {item.label}
                </AppText>
              </View>
            ))}
          </View>

          {/* A subscriber deleting their account is the one case where the
              quiet caption isn't enough: they are about to keep being charged
              by Apple for something they can no longer reach, and Apple's own
              account-deletion guidance requires we say so, name the date, and
              hand them the way out. So it becomes an actionable block rather
              than fine print — everyone else still gets the one-liner. */}
          {entitlement.tier !== 'free' ? (
            <View style={styles.billing}>
              <AppText variant="caption" color="warningText">
                {renewsOn
                  ? `Deleting your account does NOT cancel your ${TIERS[entitlement.tier].name} subscription. Apple will keep charging you, next on ${renewsOn}.`
                  : `Deleting your account does NOT cancel your ${TIERS[entitlement.tier].name} subscription. Apple will keep charging you.`}
              </AppText>
              <Pressable
                onPress={() => void manage()}
                hitSlop={8}
                style={({ pressed }) => pressed && styles.pressedLink}
              >
                <AppText variant="caption" color="accentText">
                  Manage subscription
                </AppText>
              </Pressable>
            </View>
          ) : (
            /* Names only what the reader would get wrong. Where to cancel is a
               place everyone already knows, and spelling it out ("…in Settings →
               Apple ID") was the second line that made this caveat look like an
               afterthought pasted under the list. */
            <AppText variant="caption" color="textTertiary" style={styles.note}>
              This won't cancel a subscription.
            </AppText>
          )}

          {error ? (
            <AppText
              variant="caption"
              color="dangerText"
              style={styles.error}
              accessibilityLiveRegion="polite"
            >
              {error}
            </AppText>
          ) : null}

          <View style={styles.actions}>
            <Button
              title="Delete account"
              variant="danger"
              onPress={() => void submit()}
              loading={busy}
            />
            {/* Ghost, not secondary: a bordered white button on a white card
                reads as an empty box, and blue-text-under-the-destructive-action
                is the shape every iOS alert already uses. */}
            <Button
              title="Cancel"
              variant="ghost"
              onPress={dismiss}
              disabled={busy}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  // Fills the modal, including under the card — StyleSheet.absoluteFill would
  // stop at the padded root's edges.
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: t.colors.scrimOverlay,
  },
  // No blanket `gap`: every distance in here is a statement about what belongs
  // together, and one even gap throughout is what made the first pass read as
  // five stacked things rather than three blocks.
  card: {
    width: '100%',
    backgroundColor: t.colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'stretch',
    ...t.shadows.lg,
    ...(t.scheme === 'dark'
      ? { borderWidth: 1, borderColor: t.colors.borderStrong }
      : null),
  },
  well: {
    width: WELL,
    height: WELL,
    borderRadius: radius.pill,
    backgroundColor: t.colors.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  // Overlapped onto the well's lower-right, with a card-coloured ring so it
  // reads as a separate object sitting in front of it.
  badge: {
    position: 'absolute',
    right: -spacing.xxs,
    bottom: -spacing.xxs,
    width: BADGE,
    height: BADGE,
    borderRadius: radius.pill,
    backgroundColor: t.colors.danger,
    borderWidth: 2,
    borderColor: t.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // `xs` binds the headline to its one-line consequence — they're one thought.
  lead: { marginTop: spacing.xs },
  // `xl` is the card's one section break: title block | list block | actions.
  eyebrow: { marginTop: spacing.xl, marginBottom: spacing.sm },
  list: { gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // `flex` rather than a natural width: if a label ever does outrun the card it
  // should wrap inside its own column, not push the row past the padding.
  itemLabel: { flex: 1 },
  note: { marginTop: spacing.lg },
  // Its own block, not a caption: this is the one thing on the card that costs
  // money if it goes unread.
  billing: { marginTop: spacing.lg, gap: spacing.xs },
  pressedLink: { opacity: 0.6 },
  error: { marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
}));

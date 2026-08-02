/**
 * The pinned bottom of the paywall: the ask, one line of terms, the links.
 *
 * All of it stays on screen at every scroll position. Restore Purchases and the
 * Terms/Privacy links live here rather than at the end of the scroll because App
 * Review expects them reachable, and because "where do I cancel" should never be
 * a hunt.
 *
 * Exactly one fine-print line — renewal price and the trial-refund promise in
 * a single breath (see catalog.finePrint). The owned state renders the button
 * as a quiet secondary, not a dimmed gradient slab: "you already have this" is
 * a fact, not a broken control.
 */
import { Pressable, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { makeStyles, spacing } from '@/theme';

interface Props {
  ctaLabel: string;
  /** "7 days free trial" — the offer, right where the thumb is. Null when
   * the selection doesn't come with one. */
  trial: string | null;
  /**
   * "Auto-renews annually. Cancel anytime." Null when nothing recurs (Free
   * selected, owned, or a manage CTA).
   */
  autoRenew: string | null;
  /** The selected tier is already the user's plan — quiet, inert button. */
  owned?: boolean;
  /**
   * Nothing may be purchased yet — StoreKit is still connecting, or Apple
   * hasn't returned this product. Buying against an unconfirmed price would
   * mean the figure on screen came from the local catalog rather than the
   * customer's own storefront.
   */
  disabled?: boolean;
  onPurchase: () => void;
  onRestore: () => void;
  onLegal: (kind: 'terms' | 'privacy') => void;
  purchasing?: boolean;
  restoring?: boolean;
  error?: string | null;
  /** Neutral outcome (e.g. a restore that found nothing) — not a failure. */
  note?: string | null;
}

export function PurchaseFooter({
  ctaLabel,
  trial,
  autoRenew,
  owned = false,
  disabled = false,
  onPurchase,
  onRestore,
  onLegal,
  purchasing = false,
  restoring = false,
  error,
  note,
}: Props) {
  const styles = useStyles();
  const busy = purchasing || restoring;

  return (
    <View style={styles.footer}>
      {error || note ? (
        <AppText
          variant="caption"
          color={error ? 'dangerText' : 'textSecondary'}
          align="center"
          accessibilityLiveRegion="polite"
        >
          {error ?? note}
        </AppText>
      ) : null}

      {/* Reserved so switching to a tier without a trial doesn't move the
          button out from under the thumb. */}
      <View style={styles.trial}>
        {trial ? (
          <AppText variant="caption" color="textSecondary" align="center">
            {trial}
          </AppText>
        ) : null}
      </View>

      <Button
        title={ctaLabel}
        variant={owned ? 'secondary' : 'primary'}
        size="lg"
        pill
        loading={purchasing}
        disabled={owned || busy || disabled}
        onPress={onPurchase}
      />

      {/* Terms and links are one paragraph of small print, so they're set
          tighter to each other than either is to the button. */}
      <View style={styles.legal}>
        {/* Reserved whether or not it renders, so Free doesn't pull the links
            up into the button. */}
        <View style={styles.terms}>
          {autoRenew ? (
            <AppText variant="caption" color="textTertiary" align="center">
              {autoRenew}
            </AppText>
          ) : null}
        </View>

        {/* Restore is disabled while busy — running it against an in-flight
            purchase is genuinely ambiguous. Terms and Privacy are NOT: they
            only open a page of text, they can't conflict with anything, and
            Apple requires them to be reachable from the paywall. Gating them on
            `busy` meant a purchase that never settled took the legal links down
            with it, leaving no way to read the terms and no way to restore —
            which is exactly what happened in testing. */}
        <View style={styles.links}>
          <FooterLink label={restoring ? 'Restoring…' : 'Restore'} onPress={onRestore} disabled={busy} />
          <Dot />
          <FooterLink label="Terms" onPress={() => onLegal('terms')} />
          <Dot />
          <FooterLink label="Privacy" onPress={() => onLegal('privacy')} />
        </View>
      </View>
    </View>
  );
}

function Dot() {
  return (
    <AppText variant="caption" color="textTertiary">
      ·
    </AppText>
  );
}

/**
 * A Pressable rather than a tappable AppText: AppText forwards no hitSlop.
 *
 * The target is built mostly from real padding rather than mostly from
 * `hitSlop`. It used to be the other way round — a 19pt caption row carrying a
 * 44pt target entirely on slop — and that is a fragile way to own a tap: slop
 * extends the touch area beyond the view's own bounds, where an ancestor's
 * clipping, or a system gesture area at the bottom of the screen, can eat it.
 * Padding is inside the bounds and nothing can take it away. Slop stays, but
 * only as the last few points.
 */
function FooterLink({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.link,
        pressed && styles.linkPressed,
        disabled && styles.linkDisabled,
      ]}
    >
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles(() => ({
  // Transparent — an opaque fill would band across the background.
  //
  // The button, the renewal line and the links are one unit: the terms explain
  // the button and the links are its escape hatches, so they're set close
  // enough to read as a block rather than three stray rows.
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  // One caption line (19pt), reserved whether or not it's rendered.
  trial: { minHeight: 19, justifyContent: 'center' },
  // No gap: the links now carry their own vertical padding, and stacking a gap
  // on top of it would read as a break between the renewal line and the escape
  // hatches it belongs with.
  legal: { gap: 0 },
  // One caption line (19pt), reserved whether or not it's rendered.
  terms: { minHeight: 19, justifyContent: 'center' },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  // 19pt of caption + 16 of padding = a 35pt target before the 6pt of slop
  // either side takes it past 44. The row grows the footer by ~14pt, which is
  // slack the page had going spare above the button.
  link: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  linkPressed: { opacity: 0.6 },
  linkDisabled: { opacity: 0.4 },
}));

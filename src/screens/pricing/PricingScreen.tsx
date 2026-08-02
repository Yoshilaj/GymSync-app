/**
 * The paywall.
 *
 * Anatomy, top to bottom: a drawn media band → the tier picker → the benefits
 * → the billing options → the button → the terms. It answers the reader's
 * questions in the order they arrive: what is this, which version, what do I
 * get, what does it cost, how do I start, what's the catch.
 *
 * There is no headline. With the tabs naming the tier and the checklist naming
 * what it buys, a line of prose between them only restated both — and every
 * sentence removed here made the artwork carry more.
 *
 * The media band is real artwork rather than a logo on a background — see
 * PaywallHero. A paywall's first job is to make the product feel like
 * something worth owning, and nothing in a settings-shaped layout does that.
 *
 * Pure and prop-driven — no useRoute, no useNavigation. Navigation lives in the
 * adapters in PricingRoutes.tsx. That split is what lets this file mount from
 * Settings today, from onboarding later, and from a bare dev render in between,
 * and it keeps the design surface free of navigator coupling while it's being
 * iterated on.
 *
 * Mounted twice: Settings → Account → Plan (a full-screen modal), and as the
 * first screen of the post-signup onboarding stack. The two differ only in the
 * props they're handed — a dismiss and a back chevron in one, a Skip and a
 * hand-off in the other. See PricingRoutes.tsx.
 */
import { useState } from 'react';
import { Linking, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { AppText, Entering, Screen } from '@/components/ui';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';
import { useBilling } from '@/billing/BillingProvider';
import { BillingError, type Entitlement } from '@/api/billing';
import { LEGAL_URL } from '@/content/legal/urls';
import {
  autoRenewNote,
  ctaLabel as continueLabel,
  DEFAULT_PERIOD,
  isPaidTier,
  nextUpgradeFrom,
  planOptions,
  savingsNoteFrom,
  serviceLevel,
  TIERS,
  trialLine,
  type BillingPeriod,
  type PaidTierId,
  type TierId,
} from './catalog';
import { PaywallHero } from './components/PaywallHero';
import { TierTabs, TRACK_HEIGHT } from './components/TierTabs';
import { PlanOptionCard } from './components/PlanOptionCard';
import { FeatureList } from './components/FeatureList';
import { PurchaseFooter } from './components/PurchaseFooter';

export type PricingContext = 'settings' | 'onboarding';

/**
 * One value instead of two booleans and a string: this makes "purchasing and
 * restoring at once, with a stale error" unrepresentable, and clears the error
 * implicitly on every new attempt.
 */
type Work =
  | { kind: 'idle' }
  | { kind: 'working'; action: 'purchase' | 'restore' }
  | { kind: 'note'; message: string }
  | { kind: 'error'; message: string };

/**
 * Apple's price for a SKU, falling back to the catalog's.
 *
 * StoreKit is the only honest source: it knows the customer's storefront,
 * currency and any regional price point, none of which the hardcoded US cents
 * can express. The fallback exists so the screen still renders something
 * sensible in the simulator before products load — the CTA stays disabled until
 * they do, so nobody can buy against a fallback price.
 */
function displayPrice(
  storeProduct: { displayPrice?: string } | undefined,
  fallback: string,
): string {
  return storeProduct?.displayPrice || fallback;
}

/** What the one big button does for the current (entitlement, selection) pair. */
type CtaMode = 'owned' | 'manage' | 'trial' | 'upgrade';

/**
 * The media band's share of the screen. Proportional rather than fixed so the
 * artwork gives space back on a 4.7" phone instead of pushing the CTA off it;
 * clamped so it can't become a stripe or a poster.
 *
 * The ratio is the last thing that gets trimmed, not the first — but the whole
 * page is budgeted to render without scrolling, and at 0.28 a 6.1" phone came
 * up ~8pt short of that. The band is the only element on the page whose exact
 * height carries no information, so it pays. On a 6.3" phone the difference is
 * ~17pt of sky nobody will miss; the lockup centres inside whatever is left.
 */
const HERO_RATIO = 0.26;
const HERO_MIN = 200;
const HERO_MAX = 244;

/**
 * The line under the mark.
 *
 * Names the product and the thing you do with it, rather than describing the
 * transaction — "unlock the full experience" is what a paywall says, not what
 * an app is for, and it read as boilerplate above artwork this specific. Three
 * words also hold one line at h1 on the narrowest phone, which is what lets
 * the lockup sit as a single block instead of a wrapped paragraph.
 *
 * Static rather than per-tier: it's what the product is, not what a plan
 * costs, and a line that changed with the tabs would make the artwork twitch
 * every time someone compared prices.
 */
const HERO_TITLE = 'Train with GymSync';

/**
 * How many of Pro's features the Free tab shows locked.
 *
 * Two, and the count is load-bearing rather than taste: it is sized to the hole
 * the missing price picker leaves. Two locked rows plus their rule and label
 * come to ~118pt against the picker's ~103, so the Free tab lands within ~15pt
 * of the paid ones — the tabs stay a dial rather than a page-length switch, and
 * every tier clears the fold. A third row costs 42pt and pushes Free into a
 * scroll on a 6.1" phone.
 *
 * A teaser that listed everything would also make the Pro tab redundant instead
 * of inviting. The first two are the ones people came for — voice, hands-free.
 */
const LOCKED_PREVIEW = 2;

export interface PricingScreenProps {
  context?: PricingContext;
  /** Pre-select a tier (e.g. arriving from an upgrade prompt). */
  highlight?: PaidTierId;
  onClose?: () => void;
  onPurchased?: (entitlement: Entitlement) => void;
  /** Onboarding only — continue without subscribing. */
  onSkip?: () => void;
  onLegal?: (kind: 'terms' | 'privacy') => void;
}

export function PricingScreen({
  context = 'settings',
  highlight,
  onClose,
  onPurchased,
  onSkip,
  onLegal,
}: PricingScreenProps) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const isFocused = useIsFocused();
  const {
    entitlement,
    refresh,
    products,
    connected,
    introEligible,
    purchase: purchaseSku,
    restore: restorePurchases,
    manage: openManageSubscription,
  } = useBilling();

  // Lazy initializer, not an effect — no first frame with the wrong tier selected.
  const [selected, setSelected] = useState<TierId>(
    () => highlight ?? nextUpgradeFrom(entitlement.tier),
  );
  const [period, setPeriod] = useState<BillingPeriod>(DEFAULT_PERIOD);
  const [work, setWork] = useState<Work>({ kind: 'idle' });

  const tier = TIERS[selected];
  const paidTier = isPaidTier(tier) ? tier : null;
  const busy = work.kind === 'working';
  // The SKU the button would actually buy, and whether Apple has told us about
  // it yet. Buying is blocked until it has: without Apple's product there is no
  // verified price, and the figure on screen would be the catalog's guess.
  const selectedProductId = paidTier?.prices[period].productId ?? null;
  const storeProduct = selectedProductId ? products[selectedProductId] : undefined;
  const productReady = Boolean(storeProduct);

  // Ownership is per SKU, not per tier. Comparing tiers alone told a Pro
  // MONTHLY subscriber that Pro YEARLY was already "your current plan" — and
  // disabled the button on a plan they had never bought.
  const owned = paidTier
    ? entitlement.productId === selectedProductId
    : entitlement.tier === 'free';

  // Where the selection sits against what they hold, in Apple's own ordering.
  // Lower is better, so a smaller number means a genuine upgrade.
  const currentLevel = serviceLevel(entitlement.productId);
  const selectedLevel = serviceLevel(selectedProductId);

  // "2 months off" recomputed from Apple's real numbers. Regional price points
  // don't scale uniformly, so the US-derived claim can be untrue elsewhere —
  // and it sits inches from the actual prices, where a customer would see it.
  const savings = paidTier
    ? savingsNoteFrom(
        paidTier,
        products[paidTier.prices.monthly.productId]?.price,
        products[paidTier.prices.yearly.productId]?.price,
      )
    : null;

  const heroHeight = Math.min(HERO_MAX, Math.max(HERO_MIN, height * HERO_RATIO));

  // "manage" covers every move that Apple owns rather than us: leaving a paid
  // plan for Free, and any step DOWN the service levels — Premium to Pro, or
  // yearly to monthly. Apple defers those to the next renewal, so offering an
  // immediate-sounding button for them would promise something that doesn't
  // happen. They go to the App Store's subscription sheet instead.
  const mode: CtaMode = owned
    ? 'owned'
    : !paidTier
      ? 'manage'
      : entitlement.tier === 'free'
        ? 'trial'
        : selectedLevel < currentLevel
          ? 'upgrade'
          : 'manage';

  // Naming the tier is only right when the tier is actually changing. To a Pro
  // monthly subscriber looking at Pro yearly, "Upgrade to Pro" reads as a bug —
  // they are already Pro. What changes there is the billing period.
  const upgradeLabel =
    selected === entitlement.tier
      ? `Switch to ${period === 'yearly' ? 'yearly' : 'monthly'}`
      : `Upgrade to ${tier.name}`;

  const cta = {
    owned: 'Your current plan',
    manage: 'Manage subscription',
    trial: continueLabel(),
    upgrade: upgradeLabel,
  }[mode];

  const run = async (action: 'purchase' | 'restore') => {
    if (action === 'purchase' && (!paidTier || !selectedProductId)) return;
    setWork({ kind: 'working', action });
    try {
      const next =
        action === 'purchase' && selectedProductId
          ? await purchaseSku(selectedProductId)
          : await restorePurchases();

      // A restore that finds nothing is a normal outcome, not a success: don't
      // celebrate it, and above all don't hand off (which would pop the screen
      // as though something had been bought).
      if (next.tier === 'free') {
        setWork({ kind: 'note', message: 'No previous purchase found on this Apple ID.' });
        return;
      }

      setWork({ kind: 'idle' });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
      onPurchased?.(next);
    } catch (e) {
      // Backing out is not a failure — no buzz, no red text.
      if (e instanceof BillingError && e.code === 'cancelled') {
        setWork({ kind: 'idle' });
        return;
      }

      // Apple took the money but we couldn't reach the backend to verify it.
      // Emphatically not an error to the customer: the purchase IS real, and
      // the reconcile pass submits it as soon as the network returns. Telling
      // them it failed would send them to support over a working purchase.
      if (e instanceof BillingError && e.code === 'network' && action === 'purchase') {
        setWork({
          kind: 'note',
          message: 'Purchase complete — activating your plan shortly.',
        });
        return;
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setWork({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Something went wrong. Try again.',
      });
    }
  };

  // Settings presents this modally, so it dismisses with an X. The onboarding
  // mount is a pushed step in its own stack, where a back chevron is correct.
  const onboarding = context === 'onboarding';

  return (
    <Screen
      scroll
      padded={false}
      // No top edge: the artwork bleeds under the status bar, which is the
      // whole point of a media band. No bottom edge — the footer pads itself.
      edges={['left', 'right']}
      tabBarClearance={false}
      padBottom={spacing.md}
      footer={
        <PurchaseFooter
          ctaLabel={cta}
          // Two conditions, and BOTH matter. An upgrade between paid tiers
          // never earns another intro offer — and Apple's eligibility is per
          // subscription GROUP, so someone who already spent the trial on Pro
          // is not eligible on Premium either. Only StoreKit knows that, so
          // promising a trial without asking would advertise something the
          // customer won't receive.
          trial={mode === 'trial' && introEligible ? trialLine() : null}
          autoRenew={
            paidTier && (mode === 'trial' || mode === 'upgrade')
              ? autoRenewNote(period)
              : null
          }
          owned={mode === 'owned'}
          // Nothing may be bought against a price Apple hasn't confirmed.
          // "manage" is exempt: it opens Apple's sheet and needs no product.
          disabled={mode !== 'manage' && mode !== 'owned' && (!connected || !productReady)}
          onPurchase={() => {
            if (mode === 'manage') {
              void openManageSubscription();
              return;
            }
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            void run('purchase');
          }}
          onRestore={() => void run('restore')}
          // Never a dead tap. `onLegal?.(kind)` silently swallowed the press on
          // any mount that didn't pass the prop — and "the Terms link does
          // nothing" is both a bad look and an App Review finding. Without a
          // handler there is no `Legal` route to push, so the hosted mirror is
          // the honest destination.
          onLegal={(kind) =>
            onLegal ? onLegal(kind) : void Linking.openURL(LEGAL_URL[kind])
          }
          purchasing={busy && work.action === 'purchase'}
          restoring={busy && work.action === 'restore'}
          error={work.kind === 'error' ? work.message : null}
          note={work.kind === 'note' ? work.message : null}
        />
      }
    >
      {/* A native modal is its own view controller, so it doesn't inherit the
          global status-bar style set outside NavigationContainer. */}
      {isFocused ? <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} /> : null}

      <PaywallHero height={heroHeight} title={HERO_TITLE} />

      {/* Chrome rides over the artwork — a media band shouldn't have a title
          bar sitting on top of it. The chevron is a back control, not a
          dismiss: from Settings the paywall is somewhere you came from. It
          renders only when there is somewhere to go — the onboarding mount is
          the root of its stack, and a chevron there would be a dead button
          promising an exit it can't make. Skip is that mount's way out. */}
      <View style={[styles.chrome, { top: insets.top + spacing.xs }]} pointerEvents="box-none">
        {onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.chromeButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </Pressable>
        ) : (
          // Holds the row's left end so Skip stays pinned right.
          <View />
        )}

        {onboarding && onSkip ? (
          <Pressable
            onPress={onSkip}
            hitSlop={12}
            accessibilityRole="button"
            style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
          >
            <AppText variant="caption" color="textSecondary">
              Skip
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.body}>
        {/* Straddles the hero's bottom edge — glass over artwork. Rendered
            after the hero (which is pointerEvents="none"), so the negative
            margin costs no touches. */}
        <Entering index={0}>
          <View style={styles.tabs}>
            <TierTabs value={selected} onChange={setSelected} disabled={busy} />
          </View>
        </Entering>

        {/* Keyed on the tier so the list remounts and re-staggers on switch. */}
        <FeatureList
          key={selected}
          eyebrow={paidTier?.inherits}
          features={tier.features}
        />

        {/* Free has nothing to buy, so the picker simply isn't there — and the
            half-screen it left behind was the paywall's biggest wasted space.
            What belongs in that slot is the argument the picker makes on the
            paid tabs: here is the next thing, here is what it costs. So Free
            gets the first half of Pro's list, locked. It fills the gap with the
            one thing the tab was missing — a reason to leave it. */}
        {paidTier ? (
          <View style={styles.plans}>
            {/* Right-aligned so it lands over the annual card it describes,
                without making that card taller than its neighbour.
                Height is reserved even when there's no claim to make, so a
                storefront where annual doesn't save a month doesn't shift the
                cards up. */}
            <View style={styles.savings}>
              {savings ? (
                <AppText variant="caption" color="accentText" align="right">
                  {savings}
                </AppText>
              ) : null}
            </View>

            <View style={styles.options}>
              {planOptions(paidTier).map((opt) => (
                <PlanOptionCard
                  key={opt.period}
                  // Apple's localized price when it has loaded — right
                  // currency, right storefront — with the catalog as the
                  // pre-load placeholder.
                  price={displayPrice(
                    products[paidTier.prices[opt.period].productId],
                    opt.price,
                  )}
                  unit={opt.unit}
                  selected={opt.period === period}
                  onPress={() => setPeriod(opt.period)}
                />
              ))}
            </View>
          </View>
        ) : (
          <FeatureList
            tone="locked"
            eyebrow={`Only on ${TIERS.pro.name}`}
            features={TIERS.pro.features.slice(0, LOCKED_PREVIEW)}
          />
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  chrome: {
    position: 'absolute',
    left: layout.SCREEN_H_PADDING,
    right: layout.SCREEN_H_PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  // Translucent rather than solid: it sits on artwork, not on a surface.
  chromeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.bgSubtle,
    opacity: 0.92,
  },
  skip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm },
  pressed: { opacity: 0.6 },
  // The band is full-bleed, so the gutter starts here rather than on Screen.
  //
  // `xl` is the page's one inter-group gap, and it's deliberately 3× the gap
  // inside a list (FeatureList.ROW_GAP). Two distances, used consistently, are
  // what make a stack of rows read as composed instead of merely spaced out —
  // an even gap everywhere leaves the eye no way to tell a group from its
  // neighbour, which is exactly how the old 16-everywhere version read.
  body: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
    gap: spacing.xl,
  },
  // Dipped into the hero's bottom edge rather than centred on it: a quarter of
  // the pill sits over the artwork, enough for the glass to have something to
  // refract without the control looking like it's sliding off the horizon.
  //
  // marginBottom takes the gap below the tabs from `xl` to `xxl`. The tabs are
  // a control, not a section — separating a filter from the content it filters
  // earns more room than two adjacent content blocks do, and the page had the
  // slack sitting unused above the footer.
  tabs: { marginTop: -TRACK_HEIGHT / 4, marginBottom: spacing.sm },
  // `xxl` below the feature list, not `xl` — the price picker is where the page
  // turns from describing to asking, and that turn deserves more air than the
  // gap between two content blocks.
  //
  // The earlier `md` here was wrong for a different reason: it made the gap 36,
  // which is off the 8-grid and sat between two named steps, so it read as
  // drift rather than intent. `sm` on top of the body's `xl` lands on `xxl`.
  //
  // The savings caption and the cards below it keep the same relationship
  // FeatureList has between its eyebrow and its rows, so the page uses one
  // label-to-content distance rather than two slightly different ones.
  plans: { marginTop: spacing.sm, gap: spacing.md },
  // Matches FeatureList's eyebrow slot exactly (24 reserved, `md` to the
  // content). Height is still reserved when there's no claim to make, so a
  // storefront where annual saves nothing doesn't pull the cards upward.
  //
  // Worth knowing if you retune these: 24 + md here replaces the old
  // md + 16 + sm, which is the same total. The zones stay height-pinned, so
  // switching tier or period still moves nothing on screen.
  savings: { minHeight: 24, justifyContent: 'center' },
  // Two-up: both prices are short, so the choice is one glance.
  // `stretch` keeps the pair the same height however each card renders.
  options: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
}));

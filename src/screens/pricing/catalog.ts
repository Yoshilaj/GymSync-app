/**
 * The single source of truth for what GymSync sells.
 *
 * Prices are stored ONCE, in whole cents, as integers. Everything a shopper
 * reads — the per-month equivalent, "2 months free", "save 17%", the fine print
 * under the button — is *computed* from those integers. Change a price here and
 * every derived claim moves with it; there is no second place to forget.
 *
 * That matters beyond tidiness: "2 months free" and "save 17%" are claims about
 * money. A badge left stale after a price edit is a consumer-protection problem,
 * not a cosmetic one.
 *
 * Cents-as-integers also sidesteps float drift entirely. `(14.99 * 12 - 149.90)
 * / 14.99` can land on 1.9999… in IEEE-754, and a `Math.floor` there would
 * advertise "1 month free" against a two-month offer.
 */
import type { Ionicons } from '@expo/vector-icons';

export type TierId = 'free' | 'pro' | 'premium';
export type PaidTierId = Exclude<TierId, 'free'>;
export type BillingPeriod = 'monthly' | 'yearly';

/** How long the introductory trial runs. Every trial string reads this. */
export const TRIAL_DAYS = 7;

/**
 * The App Store subscription group all four SKUs belong to.
 *
 * One group is not a detail — it's what lets Apple own upgrades, downgrades and
 * proration, and what makes holding Pro *and* Premium at once (double billing,
 * refund territory) essentially impossible.
 *
 * The consequence to remember: introductory-offer eligibility is per GROUP, not
 * per product. Someone who spent the trial on Pro is not eligible again on
 * Premium, which is why the paywall asks StoreKit rather than assuming.
 */
export const SUBSCRIPTION_GROUP_ID = 'gymsync.membership';

/**
 * The same group as App Store Connect knows it: the numeric "Group ID" on the
 * subscription-group page (also visible in its URL). Two constants because they
 * are two different namespaces that happen to describe one group:
 * - `SUBSCRIPTION_GROUP_ID` above is the group's *name*, which the local
 *   .storekit file uses (tools/generate-storekit.mjs reads it) — so local
 *   StoreKit-config testing resolves it fine.
 * - Production StoreKit resolves groups by this numeric id ONLY. Passing the
 *   name to `isEligibleForIntroOfferIOS` works against the local .storekit and
 *   silently fails in production — trial eligibility always comes back false,
 *   so the paywall stops advertising a trial the customer would actually get.
 *
 * BillingProvider prefers this and falls back to the name, so local
 * StoreKit-config testing keeps working either way.
 */
export const ASC_SUBSCRIPTION_GROUP_ID = '22275760';

const MONTHS_PER_YEAR = 12;

export interface Feature {
  label: string;
  /** The capability's glyph — rendered in a soft well, What's-New-sheet style. */
  icon: keyof typeof Ionicons.glyphMap;
  /** Optional qualifier set beside the label — a quantity the label can't carry. */
  note?: string;
}

/** One purchasable SKU. `cents` is the only hand-typed number in this file. */
export interface Price {
  cents: number;
  /**
   * App Store Connect product identifier. A contract with Apple, so it is
   * written out in full rather than derived from the bundle id — a clever
   * derivation is how you ship an unpurchasable SKU.
   *
   * Bundle-prefixed on purpose. These strings are globally unique across all of
   * App Store Connect and immutable once created, so a short generic id is a
   * gamble that nobody else claimed it first.
   */
  productId: string;
}

interface TierBase {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** The paywall's one-line promise for this tier, under the wordmark. */
  tagline: string;
  features: readonly Feature[];
}

export interface FreeTier extends TierBase {
  id: 'free';
  prices: null;
  inherits: null;
}

export interface PaidTier extends TierBase {
  id: PaidTierId;
  prices: Record<BillingPeriod, Price>;
  /** Rendered as the list eyebrow, not as a sixth bullet — it frames the list. */
  inherits: string;
}

export type Tier = FreeTier | PaidTier;

/** `prices: null` makes "the free tier has a price" unrepresentable. */
export const isPaidTier = (t: Tier): t is PaidTier => t.prices !== null;

export const TIERS = {
  free: {
    id: 'free',
    name: 'Free',
    icon: 'sparkles-outline',
    tagline: 'Everything you need to start training.',
    prices: null,
    inherits: null,
    // Wording is the user's, verbatim — don't editorialize it.
    features: [
      { label: 'AI Chat Coach', icon: 'chatbubble-ellipses-outline', note: 'Limited messages' },
      { label: 'One-time AI Plan Generation', icon: 'sparkles-outline' },
      { label: 'Workout Logging', icon: 'barbell-outline' },
      { label: 'Body Weight Logging', icon: 'scale-outline' },
      { label: 'Progress Trend Charts', icon: 'trending-up-outline' },
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    icon: 'mic-outline',
    tagline: 'Your coach, live in your ear, every set.',
    inherits: 'Everything in Free, and:',
    prices: {
      monthly: { cents: 1499, productId: 'com.yoshinishikawahara.gymsync.pro.monthly' },
      yearly: { cents: 14900, productId: 'com.yoshinishikawahara.gymsync.pro.yearly' },
    },
    features: [
      { label: 'Live Voice Coaching', icon: 'mic-outline', note: '10 sessions a month' },
      { label: 'Hands-Free Set Logging', icon: 'hand-left-outline' },
      { label: 'Unlimited AI Chat Coach', icon: 'chatbubbles-outline' },
      { label: 'Unlimited AI Plan Generation', icon: 'sparkles-outline' },
      { label: 'Choice of Coach Personality', icon: 'people-outline' },
    ],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    icon: 'shield-checkmark-outline',
    tagline: 'The complete coaching brain, always on.',
    inherits: 'Everything in Pro, and:',
    prices: {
      monthly: { cents: 2999, productId: 'com.yoshinishikawahara.gymsync.premium.monthly' },
      yearly: { cents: 29900, productId: 'com.yoshinishikawahara.gymsync.premium.yearly' },
    },
    features: [
      { label: 'Unlimited Live Voice Coach', icon: 'infinite-outline' },
      { label: 'Evidence-Based Coaching', icon: 'school-outline' },
      { label: 'Data-Driven Progression Management', icon: 'analytics-outline' },
      { label: 'Lifetime Personal Memory', icon: 'time-outline' },
      { label: 'Injury Aware Safety Layer', icon: 'shield-checkmark-outline' },
    ],
  },
} as const satisfies Record<TierId, Tier>;

/** One SKU, flattened. The shape a store hands back and the shape a test asserts on. */
export interface Sku {
  tier: PaidTierId;
  period: BillingPeriod;
  productId: string;
  cents: number;
}

/**
 * Every purchasable SKU, in service-level order (best first).
 *
 * The order is the same one App Store Connect needs for the subscription
 * group's service levels, and it is deliberately four *distinct* levels rather
 * than two shared per tier: distinct levels make monthly -> yearly an immediate
 * prorated upgrade instead of a crossgrade Apple defers to the next renewal.
 */
export const SKUS: readonly Sku[] = (['premium', 'pro'] as const).flatMap((tier) =>
  (['yearly', 'monthly'] as const).map((period) => ({
    tier,
    period,
    productId: TIERS[tier].prices[period].productId,
    cents: TIERS[tier].prices[period].cents,
  })),
);

/** productId -> which SKU it is. The lookup a purchase callback needs. */
export const SKU_BY_PRODUCT_ID: Readonly<Record<string, Sku>> = Object.fromEntries(
  SKUS.map((sku) => [sku.productId, sku]),
);

/**
 * A SKU's position in the subscription group, LOWEST number = best plan.
 *
 * Mirrors the service levels configured in App Store Connect, which is what
 * decides how Apple treats a plan change: moving to a better level bills
 * immediately with proration, moving to a worse one is deferred to the next
 * renewal. The paywall has to make the same distinction or it offers an
 * "Upgrade" button for something Apple won't action until the period ends.
 *
 * Unknown ids sort last, so a product we don't recognize is never mistaken for
 * an upgrade.
 */
export function serviceLevel(productId: string | null | undefined): number {
  if (!productId) return Number.MAX_SAFE_INTEGER;
  const index = SKUS.findIndex((s) => s.productId === productId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/** Tab order on the paywall — cheapest first, so price ascends left to right. */
export const ALL_TIERS: readonly TierId[] = ['free', 'pro', 'premium'];

/** The two tiers the paywall actually sells. Free is the state you're already in. */
export const PAID_TIERS: readonly PaidTierId[] = ['pro', 'premium'];

export const DEFAULT_TIER: PaidTierId = 'pro';
export const DEFAULT_PERIOD: BillingPeriod = 'yearly';

/** Where the CTA points someone who is already paying. */
export function nextUpgradeFrom(tier: TierId): PaidTierId {
  return tier === 'pro' ? 'premium' : tier === 'premium' ? 'premium' : DEFAULT_TIER;
}

// ── Derived figures ─────────────────────────────────────────────────────────
// Never hand-type any of these. They exist so the numbers can't disagree.

/** "$14.99", "$149.90" — always two decimals. */
export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Months of the monthly price that a year's subscription hands back.
 *
 * Integer cents throughout, so this can't drift: `14.99 * 12 - 149.90` lands on
 * 1.9999… in floating point, and a floor there would advertise "1 month free"
 * against a two-month offer.
 */
export function monthsFree(tier: PaidTier): number {
  const { monthly, yearly } = tier.prices;
  return Math.round((monthly.cents * MONTHS_PER_YEAR - yearly.cents) / monthly.cents);
}

/**
 * One selectable billing option.
 *
 * Monthly leads because it's the smaller number and the easier yes; annual
 * sits beside it as the upgrade, carrying the only claim on the picker — the
 * months it hands back.
 *
 * Price and unit are separate so the card can set the figure large and the
 * cadence small against it; as one string they'd have to share a size, and the
 * number is the thing being compared.
 */
export interface PlanOption {
  period: BillingPeriod;
  /** "$14.99" */
  price: string;
  /** "/ month", "/ annual" */
  unit: string;
}

/**
 * Both options of the picker, in the order they're read.
 *
 * A price and nothing else, so the two cards are identical in structure and
 * can't go lopsided. What they share — the trial — sits by the button; what
 * separates them — `savingsNote` — is set above the annual card.
 */
export function planOptions(tier: PaidTier): PlanOption[] {
  return [
    {
      period: 'monthly',
      price: formatUsd(tier.prices.monthly.cents),
      unit: '/ month',
    },
    {
      period: 'yearly',
      price: formatUsd(tier.prices.yearly.cents),
      unit: '/ annual',
    },
  ];
}

/**
 * The offer, stated once directly above the button.
 *
 * It used to sit inside both option cards, which printed the same sentence
 * twice and said nothing about the choice between them. It belongs to the
 * button — it's the answer to "what happens when I tap this".
 */
export function trialLine(): string {
  return `${TRIAL_DAYS} days free trial`;
}

// ── Copy built from the numbers ─────────────────────────────────────────────
// These sentences are legally load-bearing, so they live beside the arithmetic
// rather than in JSX where a price could be typed by hand.

/**
 * "2 months off" — the annual option's claim, set right-aligned above its card.
 *
 * Outside the card rather than in it: inside, it made the annual option a line
 * taller than the monthly one and no arrangement of the two looked level.
 */
export function savingsNote(tier: PaidTier): string {
  const months = monthsFree(tier);
  return `${months} month${months === 1 ? '' : 's'} off`;
}

/**
 * The same claim, computed from Apple's ACTUAL prices when we have them.
 *
 * This matters beyond tidiness. The cents in this file are the US ladder; Apple
 * sets its own price points per storefront, and they don't scale uniformly. A
 * yearly plan that saves two months in the US can save one — or none — in
 * another country, and "2 months off" printed there is a false claim about
 * money made to a customer who can see the real numbers right beside it.
 *
 * Falls back to the catalog figure only when StoreKit hasn't answered yet, and
 * returns null when the real numbers say there is nothing to boast about.
 */
export function savingsNoteFrom(
  tier: PaidTier,
  monthlyPrice: number | null | undefined,
  yearlyPrice: number | null | undefined,
): string | null {
  if (monthlyPrice == null || yearlyPrice == null || monthlyPrice <= 0) {
    return savingsNote(tier);
  }
  const months = Math.round(
    (monthlyPrice * MONTHS_PER_YEAR - yearlyPrice) / monthlyPrice,
  );
  if (months < 1) return null;
  return `${months} month${months === 1 ? '' : 's'} off`;
}

/**
 * The one line under the CTA.
 *
 * Follows the *selected* period rather than saying "monthly" always — the
 * sentence is a billing disclosure, and an annual subscriber told their plan
 * auto-renews monthly has been told something untrue.
 */
export function autoRenewNote(period: BillingPeriod): string {
  const cadence = period === 'yearly' ? 'annually' : 'monthly';
  return `Auto-renews ${cadence}. Cancel anytime.`;
}

/**
 * The button never names a price or a period — the picker directly above it
 * already does, and the row is selected, so "Continue" is unambiguous.
 */
export function ctaLabel(): string {
  return 'Upgrade';
}

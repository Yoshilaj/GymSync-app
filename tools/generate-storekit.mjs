/**
 * Generate GymSync.storekit from the pricing catalog.
 *
 *   node tools/generate-storekit.mjs
 *
 * Generated rather than hand-written for one reason: a .storekit file accepts
 * ANY product ids. Type them by hand and the simulator goes green against
 * products that don't exist in App Store Connect — the local suite passes and
 * the real purchase fails. Deriving them from catalog.ts makes that
 * impossible, and `--check` turns drift into a failure instead of a surprise.
 *
 * The file lives at the repo root on purpose: ios/ is gitignored and wiped by
 * every prebuild.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'GymSync.storekit');

// Parsed rather than imported: catalog.ts is TypeScript with path aliases, and
// a regex over four literal lines is a far smaller dependency than a TS loader.
const catalog = readFileSync(join(root, 'src/screens/pricing/catalog.ts'), 'utf8');

function readPrices(tier) {
  const block = catalog.split(`  ${tier}: {`)[1];
  if (!block) throw new Error(`No ${tier} tier in catalog.ts`);
  const out = {};
  for (const period of ['monthly', 'yearly']) {
    const m = block.match(
      new RegExp(`${period}: \\{ cents: (\\d+), productId: '([^']+)' \\}`),
    );
    if (!m) throw new Error(`No ${tier}.${period} price in catalog.ts`);
    out[period] = { cents: Number(m[1]), productId: m[2] };
  }
  return out;
}

const groupId = catalog.match(/SUBSCRIPTION_GROUP_ID = '([^']+)'/)?.[1];
const trialDays = Number(catalog.match(/TRIAL_DAYS = (\d+)/)?.[1]);
if (!groupId || !trialDays) throw new Error('Missing group id or trial length in catalog.ts');

const tiers = { pro: readPrices('pro'), premium: readPrices('premium') };

const money = (cents) => (cents / 100).toFixed(2);

/**
 * Service levels, best first. FOUR distinct levels, not two shared per tier:
 * distinct levels make monthly → yearly an immediate prorated upgrade rather
 * than a crossgrade Apple defers to the next renewal.
 */
const ORDER = [
  ['premium', 'yearly'],
  ['premium', 'monthly'],
  ['pro', 'yearly'],
  ['pro', 'monthly'],
];

const subscriptions = ORDER.map(([tier, period], i) => {
  const { cents, productId } = tiers[tier][period];
  const name = `${tier[0].toUpperCase()}${tier.slice(1)} ${period === 'yearly' ? 'Yearly' : 'Monthly'}`;
  return {
    adHocOffers: [],
    codeOffers: [],
    displayPrice: money(cents),
    familyShareable: false,
    groupNumber: i + 1,
    internalID: String(2000 + i),
    introductoryOffer: {
      // The 7-day free trial. Configured per product because that is the
      // .storekit schema — Apple enforces eligibility per GROUP, which is why
      // the paywall asks isEligibleForIntroOfferIOS rather than assuming.
      internalID: String(3000 + i),
      paymentMode: 'free',
      subscriptionPeriod: `P${trialDays}D`,
    },
    localizations: [
      {
        description: `GymSync ${name}`,
        displayName: name,
        locale: 'en_US',
      },
    ],
    productID: productId,
    recurringSubscriptionPeriod: period === 'yearly' ? 'P1Y' : 'P1M',
    referenceName: name,
    subscriptionGroupID: '1',
    type: 'RecurringSubscription',
  };
});

const config = {
  identifier: '00000000',
  nonRenewingSubscriptions: [],
  products: [],
  settings: {
    _applicationInternalID: '1000',
    _developerTeamID: '',
    _lastSynchronizedDate: 0,
  },
  subscriptionGroups: [
    {
      id: '1',
      localizations: [],
      name: groupId,
      subscriptions,
    },
  ],
  version: { major: 4, minor: 0 },
};

const json = JSON.stringify(config, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const current = readFileSync(OUT, 'utf8');
  if (current !== json) {
    console.error(
      'GymSync.storekit is out of date with catalog.ts.\n' +
        'Run: node tools/generate-storekit.mjs',
    );
    process.exit(1);
  }
  console.log('GymSync.storekit matches catalog.ts');
} else {
  writeFileSync(OUT, json);
  console.log(`Wrote ${OUT}`);
  for (const s of subscriptions) {
    console.log(`  level ${s.groupNumber}  ${s.productID}  $${s.displayPrice}`);
  }
}

# Real Apple In-App Purchases for GymSync — reviewed plan

**Supersedes** `docs/APPLE_IAP_IMPLEMENTATION_PLAN.md` (the ChatGPT draft).
**Written** 2026-07-30. **Status:** approved-pending — not started.

## Context

The paywall is finished and sells nothing. `src/api/billing.ts` is a deliberate stub that says
so in its own header: `BILLING_ENABLED = false`, `purchase()` waits 900ms and fabricates an
entitlement, `restorePurchases()` always finds nothing, `fetchEntitlement()` is hardcoded to
Free so Settings shows "Free" for everybody. The backend has no `/api/billing` route, no billing
table, and no tier checks — voice coaching, unlimited chat, unlimited plan generation and coach
personalities are all free to anyone with an account.

Goal: a real Apple subscription purchase that works end to end, with the entitlement decided by
the backend and never the client, and the paid features actually gated server-side.

**The constraint that shapes everything:** the only Apple asset that exists today is a Developer
Program membership. No Paid Apps Agreement, no banking/tax record, no App Store Connect app
record, no products. Those can't be conjured in a session — the agreement alone involves
Apple-side review measured in days. So App Store Connect, sandbox testers and TestFlight are all
unavailable.

What is available is a **local Xcode StoreKit configuration file**: the full StoreKit 2 flow in
the simulator with zero Apple-side setup — real payment sheet, real introductory-offer
eligibility, accelerated renewals, refunds, revocations, Ask-to-Buy, and real signed JWS
transactions. That is the verification target, and this plan is explicit about what it cannot
prove.

## What was wrong with the ChatGPT plan

Good architecture document, and its substance is kept: server-authoritative entitlement, JWS
verification before granting access, `finishTransaction` only after the backend says yes,
idempotent transaction storage as audit history. Where it's wrong:

1. **Its ordering can't be executed.** Phases 1–8 all gate on Phase 11 (App Store Connect),
   which gates on an agreement that isn't signed. Nothing in it is testable today. Local StoreKit
   inverts this: build and verify the whole path now, attach App Store Connect later.
2. **It never mentions that local StoreKit transactions can't be verified against Apple's
   roots.** They're signed with a local test certificate. Apple's Python library handles it —
   `SignedDataVerifier` skips chain verification when the environment is `Xcode`/`LocalTesting` —
   but *how* you reach that carve-out is a security decision it never raises. See §2.
3. **Its `appAccountToken` ownership rule is a bug.** It requires the token to match the
   authenticated user. But `appAccountToken` is absent on any transaction not initiated inside
   the app — App-Store-initiated resubscribes, promo codes, Family Sharing. As a hard
   requirement it rejects legitimate paying customers.
4. **Its Phase 5 storage schema has two unpopulatable columns.** The client's `purchaseToken` is
   a signed *transaction* only. There is no `signedRenewalInfo` in it, so `auto_renews` (and
   grace period, billing retry, expiration intent) cannot be known server-side without the App
   Store Server API or ASSN v2 — neither of which is reachable. A NULL column someone later
   trusts is worse than no column.
5. **ASSN v2 needs a public HTTPS endpoint and there is no deployed backend at all** — no
   Dockerfile, no render.yaml, nothing. It lists ASSN inside Milestone 1 regardless.
6. **The product IDs are wrong.** `com.gymsync.pro.monthly` doesn't match the bundle ID
   `com.yoshinishikawahara.gymsync`, and short generic IDs are globally unique across all of App
   Store Connect — plausibly already claimed. They're immutable once created.
7. **Its frontend test list is fiction.** There is no jest, no test script, no test file in
   `src/`. Thirteen frontend unit tests means standing up RN test infra first. `backend/tests/`
   already exists and is where the test investment belongs.

It gets one thing right that's easy to miss and is kept: annual savings must be computed from
real StoreKit prices, or "2 months off" becomes false wherever Apple's price points differ from
the US ladder.

## Decisions taken

- Product IDs → `com.yoshinishikawahara.gymsync.{pro,premium}.{monthly,yearly}`.
- **One** subscription group, "GymSync Membership", with **four distinct service levels**
  (premium.yearly 1, premium.monthly 2, pro.yearly 3, pro.monthly 4). One group is what lets
  Apple own proration and makes holding Pro *and* Premium simultaneously — a double-billing,
  refund-generating bug — essentially impossible. Distinct levels rather than shared per-tier
  levels means monthly→yearly is an immediate prorated upgrade rather than a crossgrade deferred
  to next renewal.
- **Consequence to accept:** introductory-offer eligibility is per *group*, not per product. A
  customer who used the 7-day trial on Pro is not eligible again on Premium. The paywall must
  read Apple's eligibility rather than always printing "7 days free trial". The Terms already
  say "one trial per Apple ID" (`src/content/legal/termsOfService.ts`), so the copy is consistent.
- Free-tier chat cap: **10 messages per day**.
- Enforcement is in scope, with the gates in §4.
- Android out of scope.

## 0. Unblock (do first — everything else is untestable without it)

- Confirm `app-store-server-library>=3.1.2` installs on Python 3.14.6 before building on it.
  `fastembed` needed care on 3.14, and this pulls `cryptography`, `pyOpenSSL`, `asn1`.
- Change the four `productId` values in `src/screens/pricing/catalog.ts:97-116`.
- Download Apple's root certificates from [Apple PKI](https://www.apple.com/certificateauthority/)
  into `backend/app/billing/certs/` — the library does **not** bundle them.
- `npx expo prebuild -p ios` + pod install. `expo-iap` is in `package.json:30` and `app.json:64`
  but absent from `ios/Podfile.lock`, so the current native build has no StoreKit at all.
- `GymSync.storekit` at the **repo root** (tracked) — it must live outside `ios/`, which is
  gitignored and wiped by prebuild. Four auto-renewable subs, one group, 7-day free trial on the
  group. **Generate its product IDs and prices from `catalog.ts`** (or assert equality in a test):
  a `.storekit` file accepts any IDs, so it will go green against IDs that don't exist in App
  Store Connect.
- Attaching it to the scheme: write a **local Expo config plugin** (`withXcodeProject` /
  `withDangerousMod`) that inserts `<StoreKitConfigurationFileReference>` into `<LaunchAction>`
  in `ios/GymSync.xcodeproj/xcshareddata/xcschemes/GymSync.xcscheme`. A standalone script you
  must remember to re-run after every prebuild is a footgun; a plugin runs inside prebuild
  automatically. `expo-iap`'s own plugin does not do this. Mind the relative path depth from
  `xcshareddata/xcschemes/`.
- `npx expo run:ios` — local StoreKit is a *scheme* setting, so this milestone builds locally.
  An EAS dev client can't pick up the config file.

## 1. Supabase: migration `013_billing.sql`

Next free number is 013 (there is no 006). Copy the RLS shape from
`008_onboarding_and_proposals.sql:44-49` and wrap `(select auth.uid())` per the perf note in
`004_rls.sql:11-12`. FK to `auth.users`, not `profiles` — during the onboarding paywall a
`profiles` row may not exist yet.

- **`apple_transactions`** — **PK `(environment, transaction_id)`**. In Sandbox and Xcode, Apple's
  transaction IDs are locally generated small integers (`0`, `1`, `2`, …) that collide across
  users *and* environments; a bare `transaction_id` PK would 409 the second test account on the
  same machine. Columns: `original_transaction_id`, `user_id` (FK `auth.users` cascade),
  `app_account_token`, `product_id`, `tier`, `period`, `purchased_at`, `expires_at`,
  `revoked_at`, `raw_revocation_reason`, `raw_offer_type`, `raw_offer_discount_type`, `raw_type`,
  `raw_ownership_type`, `is_upgraded`, `signed_date`, `raw` jsonb, timestamps. Indexes on
  `(user_id, expires_at desc)` and `(environment, original_transaction_id)`.
  - Persist **`raw*`** variants throughout: the library's `AttrsRawValueAware` leaves a typed
    field `None` and populates `rawX` for any value it doesn't recognise, so branching on the
    typed enum silently misreads future Apple values.
  - No `auto_renews` column (unpopulatable) and no `is_trial` column — derive it from the two raw
    offer fields so the rule lives in one place.
  - Audit history: rows are never destructively replaced. An upsert whose
    `coalesce(signed_date, purchased_at)` is older than what's stored is **skipped** — that's
    what makes replays and eventual out-of-order notifications safe.
- **`apple_subscription_owners`** — **PK `(environment, original_transaction_id)`**, plus
  `user_id` and `bind_reason` (`'token'` | `'inferred'`). This is the fix for the
  `appAccountToken` bug, and the binding table is **authoritative**: `apple_transactions.user_id`
  is resolved from it on every write rather than written straight from the caller's identity, so
  the two can't drift.
- **`feature_usage`** — PK `(user_id, feature, period_key)` + `count`. `period_key` is `'2026-07'`
  for monthly quotas, `'2026-07-30'` for daily, `'all'` for lifetime.
- **`increment_feature_usage(...)`** — a `SECURITY DEFINER` SQL function returning the new count.
  Required because PostgREST cannot express `count = count + 1`, and a read-then-write from the
  app layer races two concurrent voice sessions past the cap.
- RLS on all three: own-row `SELECT` only, service role writes. The service-role key bypasses
  RLS, so per `002_mvp_schema.sql:10-13` the real boundary is a mandatory `.eq("user_id", user_id)`
  in app code; RLS is defence in depth.

## 2. Backend billing

New package `backend/app/billing/`, following the module-of-async-functions pattern in
`backend/app/plan_store.py` (no classes, `db: AsyncClient` passed in).

### `apple.py` — the one thing to get right

The obvious design — a `SignedDataVerifier` per environment, dispatched on the environment claim
*inside the transaction being verified* — is a complete entitlement bypass. Apple's
`_decode_signed_object` returns an **unverified** decode when the verifier's environment is
`Xcode`/`LocalTesting`, so anyone with a bearer token could POST a hand-written unsigned JWT
claiming `{"environment":"Xcode","productId":"...premium.yearly","expiresDate":<far future>}`
and receive lifetime Premium. **Never let untrusted input choose the verification path.**

Instead: an **ordered allowlist of environments from config**, tried in order; an environment is
only ever reachable if it's on that list.

- Default `["Production", "Sandbox"]` — both are cryptographically verified, so trying Production
  and falling through on `INVALID_ENVIRONMENT` is safe, and is what lets one deployment serve
  both TestFlight and the App Store later.
- `Xcode` is insertable only via an explicit `apple_allow_local_testing` flag, and startup
  **refuses to boot** if that flag is on outside development. Today the list is `["Xcode"]`.
- `SignedDataVerifier.__init__` raises `ValueError` when the environment is `Production` and
  `app_apple_id` is None, so a production verifier literally cannot be constructed until there's
  an App Store record. Build them lazily, not as an eager registry.
- `config.py` uses `extra="ignore"`, so a mistyped env var reads as empty rather than erroring —
  these settings get explicit validation at startup, with no silent default for the environment
  list.
- Note for later: `verify_and_decode_renewal_info` checks environment but **not** bundle ID, so
  renewal info is never self-authenticating.

### `entitlement.py`

`PRODUCTS` map, `TIER_RANK`, and a **pure** `compute_entitlement(rows, now)`. Pure because it's
the whole test surface and needs no database. All rules live here, none in SQL; SQL just returns
the user's rows. Applied in order:

1. Drop `raw_type != "Auto-Renewable Subscription"`.
2. Drop `raw_ownership_type == "FAMILY_SHARED"`. Family sharing isn't enabled, so this can't
   happen — write the filter anyway so the behaviour is chosen rather than accidental.
3. Drop `revoked_at is not null`. (3.1.2 adds `revocationType`/`revocationPercentage`, so a
   *partial* refund also sets it; M1 treats any revocation as full — comment it.)
4. **Drop `is_upgraded == true`, unconditionally.** This is the rule that makes upgrades correct,
   without relying on Apple rewriting the superseded row's `expiresDate`.
5. Active iff `expires_at > now - 60s`. The small negative skew stops a renewal boundary from
   blinking someone to Free.
6. Winner = `max` by the **4-tuple** `(TIER_RANK, expires_at, purchased_at, transaction_id)`.
   "Highest tier, tie-break latest expiry" isn't a total order — identical tier and expiry is
   trivially producible in a `.storekit` file and would make the tests flaky.
7. `period` from the winner's product ID only. Never sum, never prefer recency over rank:
   overlapping Premium-yearly and Pro-monthly resolves to Premium.
8. `inTrial = raw_offer_type == 1 and raw_offer_discount_type == "FREE_TRIAL"`. `offerType == 1`
   alone also covers pay-as-you-go and pay-up-front introductory offers, which are **paid** —
   labelling those a free trial is a copy bug and a disclosure risk.
9. **Downgrades need no server handling** and the code should say so: a downgrade takes effect at
   the next renewal and produces no new transaction until then. The Premium row correctly stays
   valid until expiry. "Premium until X, then Pro" is client-only advisory copy from
   `renewalInfoIOS`.
10. **Grace period and billing retry are out of scope**, because the data doesn't exist
    server-side. Stated consequence: a card failure drops someone to Free immediately while
    Apple's own UI still says "subscribed", for up to 16 days. The fix is
    `get_all_subscription_statuses` once App Store Connect exists — *not* a blind +16-day window,
    which would over-grant on every genuine lapse with no signal to ever revoke it.

### `store.py`

Transaction upsert (monotonic, coalescing a possibly-null `signed_date`), owner bind/check,
active rows, usage read/increment.

### `routers/billing.py`

Mounted with `prefix="/api"` alongside the others in `main.py:42-51`:

- `GET /api/billing/entitlement` (auth).
- `POST /api/billing/apple/verify` (auth), body `{jws: str}`. Decode → bundle-ID and environment
  checks (the library raises on both) → known product → ownership bind/check → upsert → recompute
  → **return the entitlement in the response body** so the client can apply it optimistically
  without a second round trip that could show Free right after a successful purchase.
  Restore calls it once per transaction; no batch endpoint, which avoids inventing
  partial-failure semantics.

### Ownership binding rules

- If `appAccountToken` is present it must match — compared as **parsed UUIDs**, never as strings.
  StoreKit silently drops non-UUID values and the round-tripped case isn't guaranteed. The client
  refuses to start a purchase if the Supabase user id doesn't parse as a UUID, rather than
  minting an unbindable transaction.
- The token path may **bind**. The absent-token path normally may only **match** — otherwise any
  unbound original transaction is a first-come land grab with no recovery path. Since every
  `requestPurchase` sets the token, a first purchase always carries one.
- Narrow escape hatch for the genuine no-token case (App-Store-initiated resubscribe or promo
  redemption on a fresh install, where the user has paid and would otherwise get nothing): infer
  a bind only when the pair is unbound **and** the authenticated user has no other active
  binding, recorded as `bind_reason = 'inferred'` so it can be audited.
- Never bind and never enforce a binding for `FAMILY_SHARED` rows — family members share the
  purchaser's original transaction ID, so binding would 409 the second member.
- A genuine ownership conflict is 409. An older-or-equal replay is **200 and idempotent**, never
  409, and returns the current entitlement.

### `app/entitlements.py`

`require_tier(min_tier)` dependency factory and `consume_quota(...)`. One error shape: HTTP 403
with dict detail
`{code: 'upgrade_required' | 'quota_exhausted', required_tier, current_tier, limit?, used?, resets_at?}`.

### Deliberately cut from this milestone

The ASSN v2 endpoint (unreachable, untestable, and exactly the code that would be rewritten once
real notifications arrive — the columns it needs are already in the schema), the
`AppStoreServerAPIClient` and `.p8` plumbing (dead code without App Store Connect), and batch
verify.

## 3. Frontend

- **`src/billing/BillingProvider.tsx`** — the single `useIAP()` instance for the app, mounted once
  in `App.tsx` inside `<PlanProvider>` (App.tsx:173) wrapping `<RootGate/>`. It sits under
  `AuthProvider` (App.tsx:170) so the token is available. Exposes connection state, StoreKit
  products, the backend entitlement, intro-offer eligibility, purchase/restore/refresh/manage.
  Reconciles on `connected && token` and on `AppState → 'active'`; resets on sign-out.
  - Reconcile via `getAvailablePurchases({onlyIncludeActiveItemsIOS: true})`, **not** by
    persisting purchases. `useIAP().finishTransaction` funnels its argument through
    `toPurchaseInput`, which strips every `*IOS` field, so a stored transaction can't be
    reconstructed — re-fetch instead.
  - Guard `purchaseToken == null` (it's typed nullable): don't POST, don't finish, surface
    `unavailable`.
  - Guard `purchaseState === 'pending'` (Ask to Buy / SCA): don't POST, don't finish, wait for
    the updated event.
  - **Terminal-failure path.** On a permanent rejection (409 `already_linked`, 422 invalid) the
    transaction must be recorded locally, the message shown once, and then
    **finished anyway** — otherwise StoreKit re-delivers it on every launch forever and wedges
    the app. This is the failure mode with no natural escape.
- **`src/hooks/useEntitlement.ts`** becomes `useContext(...)`, exactly as its own comment at
  lines 7-11 predicts. Its two consumers (`PricingScreen.tsx:150`, `SettingsHomeScreen.tsx:33`)
  don't change.
- **`src/api/billing.ts`** keeps its exported surface — `Entitlement`, `FREE_ENTITLEMENT`,
  `BillingError`, the four functions — with real bodies and a leading `token` argument per
  `src/api/profile.ts:40-57`. `BILLING_ENABLED`, `SIMULATE_PURCHASE`, `FORCE_ENTITLEMENT` go
  away. Add `already_linked` to `BillingErrorCode` ("This subscription is already linked to
  another GymSync account") — the current union can't express it and it would render as a generic
  error. `openManageSubscription` switches from hardcoded `Linking.openURL` to expo-iap's
  `showManageSubscriptionsIOS()`. `renewsAt` keeps its name but means *current period end* —
  the UI can't distinguish "renews" from "ends" without renewal info.
- **Purchase path** `PricingScreen.tsx:186-219` keeps its shape: the `cancelled`-is-not-an-error
  swallow at :209, the "restore found nothing is a note not a success" branch at :198.
  Underneath: `requestPurchase({type:'subs', request:{apple:{sku, appAccountToken}}})` → POST the
  JWS → `finishTransaction` **only** on 2xx → apply the returned entitlement.
  Its `Work` union at :158 gains an *activating* state for the offline case — purchase succeeded
  locally, POST failed. That's "Purchase complete — activating…", not an error; reconcile finishes
  it.
- **Prices from Apple.** `catalog.ts` cents stay as a dev fallback; the paywall prefers StoreKit
  `displayPrice`, and `monthsFree`/`savingsNote` recompute from StoreKit's numbers. The CTA stays
  disabled until the selected product loads.
- **Trial line** at `PricingScreen.tsx:239` currently shows whenever `mode === 'trial'`; add
  `&& introEligible` from `isEligibleForIntroOfferIOS(groupId)`.
- `termsOfService.ts` promises a "Manage subscription" link in Settings that doesn't exist — add
  the row in `SettingsHomeScreen.tsx`.

## 4. Enforcement

The audit turned up traps that make the naive version wrong:

**The real chat path is the WebSocket, not `chat.py`.** `routers/chat.py:1-6` says so itself — the
SSE endpoint is deprecated and stateless. The message quota belongs at `voice_ws.py:201-203`,
after `text` is read and before the `_agent_events` loop at :228.

**Do not reject by closing the voice socket.** The socket is shared between voice (`voice: true`)
and text chat (`voice: false`), so closing it kills chat too — and `useVoiceSession.ts:424-446`
silently auto-retries every close code except `4001`, so a quota close would be retried and then
reported as a generic "Connection closed". Reject with a server message instead. (Pre-existing
bug worth knowing: `voice_ws.py:86` closes *before* `accept()`, so the client never sees `4001`
at all — it sees `1006`.)

**Voice sessions have no database row.** `VoiceSession.__init__`/`.start()`
(`agents/voice.py:205-244`) touch no table, and the `session_id` they receive is a client-supplied
`workout_sessions.id` that can be null. `workout_sessions` is unusable as a counter:
`session.py:26-29` ends prior active sessions and `useWorkoutSession.ts:61` documents that
`start()` may reattach to an existing row, so N voice sessions can share one. This is the case
that genuinely requires `feature_usage`.

**Plan generation has three entrances, one unauthenticated.** `plans.py:70-84`
`POST /plans/generate-anonymous` takes no token, so a free user who spent their one generation
can call it with a hand-built profile and adopt the result via `plans.py:91 adopt_proposal`,
which *is* authenticated. The cap must be enforced on `generate` **and** `adopt_proposal`. The
third entrance is the agent tool `propose_workout_plan` (`tools.py:228`, executor `tools.py:1067`),
which per `plans.py:4-9` is how proposals are normally created. Also `run_plan_generation` retries
internally (`core.py:704-741`), so counting `plan_proposals` rows over-counts — hence
`feature_usage`, incremented once per user-visible generation.

| Capability | Free | Pro | Premium | Enforced at |
|---|---|---|---|---|
| Voice session | 0 | 10 / month | unlimited | `voice_ws.py:158-160`, gated on `voice_enabled` |
| Chat message | 10 / day | unlimited | unlimited | `voice_ws.py:201-203` |
| Plan generation | 1 lifetime | unlimited | unlimited | `plans.py:30` + `plans.py:91` + `tools.py:1067` |
| Change coach personality | quiz result only | yes | yes | `personality.py:44` |
| `search_knowledge`, `report_injury` | — | — | yes | `core.py:606` + `tools.py:634` |

**Personality:** free keeps whatever the onboarding quiz matched and can't switch afterwards.
Implemented as "reject a write that *changes* an existing `personalities` row", not "reject any
write", because `CoachMatchingScreen.tsx:92` and `BuildingPlanScreen.tsx:192` both call
`updatePersonality` during onboarding, before anyone could have paid — a naive gate breaks the
flow that was just built.

**Tool filtering:** `TOOL_DEFINITIONS` (`tools.py:19-330`) is a module constant consumed in
exactly one place, `core.py:606`. Three cautions: `ToolContext` (`tools.py:353-364`) needs a
`tier` field; the system prompt itself instructs the model to *"Ground programming decisions with
search_knowledge first"* (`tools.py:232`), so the prompt must become tier-aware or the model will
call a tool it wasn't given; and `core.py:570-572` marks the system block `cache_control:
ephemeral`, so filtering creates three prompt-cache variants (acceptable). Add a defence-in-depth
check in `execute_tool` copying the exact precedent at `tools.py:645-650` (the anonymous-profile
gate). `list_exercises` and `propose_workout_plan` must survive filtering at every tier or
onboarding generation breaks — `core.py:716-724` reuses the same loop.

**Out of scope, and why:** Premium's "Lifetime Personal Memory" can't be gated because it isn't
wired up — `backend/app/rag/personal.py` exists but nothing calls it and `personal_chunks` has no
writer. "Data-Driven Progression Management" has no implementation either. Both stay ungated and
unclaimed until they exist.

**Frontend error plumbing has to be fixed first.** Four of the five API modules stringify the HTTP
status into a message and throw a bare `Error`, so no call site can branch on "upgrade required".
Only `src/api/plan.ts:56-90` preserves it, via `PlanApiError` and its `request()` helper.
Normalize `plan.ts`'s three lossy functions (`generatePlan`, `generateAnonymousPlan`,
`adoptPlanProposal`) and `personality.ts` onto that pattern; add `upgrade_required` /
`quota_exhausted` to `src/voice/protocol.ts`'s `ServerMessage`; stop discarding `reason` in
`VoiceSocket.ts:45-46`. Then the prompts: `VoiceCoachScreen.tsx:114-116` and
`WorkoutSessionScreen.tsx:559-561` open the paywall with `highlight: 'pro'` (that route param
already exists and has no caller yet); `useTextChat.ts:350-356` marks the message failed and
shows the prompt, distinguishing "over limit" from "retryable" so `retry()` at :378-390 doesn't
bounce off the cap.

## 5. Verification

**Backend pytest, in `backend/tests/`** — the real investment, since `compute_entitlement` is pure:
valid Pro / valid Premium, expired, revoked, unknown product, wrong bundle ID, wrong environment,
missing vs mismatched `appAccountToken` (including case-differing UUIDs), duplicate submission
returning 200 not 409, older `signed_date` losing, null `signed_date`, `is_upgraded` exclusion,
Premium+Pro overlap resolving to Premium, identical tier+expiry resolving deterministically,
monthly vs yearly mapping, free-trial vs paid-introductory-offer `inTrial`, and the quota
boundaries (10th vs 11th voice session, 1st vs 2nd free generation, day and month rollover).

Plus one test that can't be done any other way: feed the library's own JWS fixtures
(`apple/app-store-server-library-python/tests/resources`) through a **Production**-configured
verifier. That's the only way to exercise the real certificate path without App Store Connect,
and without it `certs/` is entirely untested code.

**Simulator** — `npx expo run:ios` with the `.storekit` config attached, then in Xcode's
Transaction Manager: buy Pro monthly with the trial shown → confirm the row and that Settings
flips to "Pro" → confirm the trial line disappears on a second purchase (eligibility is
per-group) → upgrade Pro→Premium and confirm precedence → accelerate a renewal → refund and
confirm access drops → Ask to Buy for the pending path → kill the app mid-purchase and confirm
reconcile on relaunch → airplane mode for the "activating…" path → sign out and confirm reset →
a free account against each of the five gates.

**What a local `.storekit` file cannot prove, and must not be claimed:** any signature at all. With
`Environment.XCODE` the library returns an unverified decode, so x5c, ES256, the chain, the Apple
roots, online checks and OCSP are all unexercised — which is exactly why the fixture test above
matters. Also unprovable: ASSN v2, the App Store Server API, Family Sharing, promo codes, real
storefront pricing and localization, real per-Apple-ID intro-offer eligibility, grace period end
to end, and whether the product IDs match App Store Connect.

**Also:** `npx tsc --noEmit`, and `npx expo config --type prebuild` to confirm the new config
plugin is well-formed.

## What ships and what doesn't

Working at the end: a real Apple purchase sheet, a signed transaction verified server-side, an
entitlement in Supabase that Settings and the paywall both read, restore, Apple-native
subscription management, and five paid features enforced on the server.

Blocked on Apple, as a documented checklist rather than code: Paid Apps Agreement, banking and
tax, the app record, the subscription group and four products with their service levels, the
7-day introductory offer, sandbox testers.

Blocked on hosting: App Store Server Notifications v2 and the App Store Server API `.p8` key —
and with them, grace period and billing-retry handling, and real-time reaction to changes made
while the app is closed. Until then those are picked up on the next foreground refresh, which is
correct but not immediate.

## Commit

Per `CLAUDE.md`, draft a milestone commit message and wait for approval before committing or
pushing. The tree is already entangled: `backend/app/{auth,database,routers/profile}.py` are the
user's own uncommitted work and must never be staged, and the uncommitted FAQ rewrite imports
`TRIAL_DAYS` from `@/screens/pricing`, so it rides along with this commit rather than shipping
alone.

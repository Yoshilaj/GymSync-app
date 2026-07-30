# Apple In-App Purchase Implementation Plan

**Project:** GymSync  
**Platform:** iOS  
**Payment system:** Apple StoreKit 2 through `expo-iap`  
**Backend:** FastAPI and Supabase  
**Last updated:** July 30, 2026

## Status

Implementation is paused pending approval of this plan.

Preliminary setup already completed:

- Installed `expo-iap`.
- Added the `expo-iap` Expo config plugin.

No purchase flow, transaction verification, entitlement storage, or paid-feature enforcement has been implemented yet.

## Objective

Make GymSync's existing paywall perform real Apple In-App Purchase transactions and securely grant Free, Pro, or Premium access.

Apple will be responsible for:

- Presenting the native payment sheet.
- Charging the customer's Apple payment method.
- Managing renewals, cancellations, refunds, billing retry, and subscription changes.
- Providing signed StoreKit transaction data.

GymSync will be responsible for:

- Displaying products and localized prices supplied by Apple.
- Starting purchases and restorations.
- Sending signed transactions to the GymSync backend.
- Cryptographically verifying transactions before granting access.
- Persisting the customer's current entitlement.
- Processing App Store Server Notifications.
- Enforcing paid feature access and usage limits.

The app must never grant paid access based only on a client-side purchase callback.

## Proposed Architecture

```text
Paywall
   |
   v
expo-iap / StoreKit 2
   |
   | Apple-signed transaction (JWS)
   v
GymSync FastAPI backend
   |
   | Verify signature, app, user, product, and dates
   v
Supabase billing records
   |
   v
Backend-authoritative entitlement
   |
   v
Free / Pro / Premium feature access

Apple App Store Server Notifications V2
   |
   +--> FastAPI notification endpoint --> Supabase billing records
```

## Subscription Catalog

Create one App Store subscription group, tentatively named **GymSync Membership**.

| Tier | Period | Current product ID | Current UI price |
|---|---|---|---:|
| Pro | Monthly | `com.gymsync.pro.monthly` | $14.99 |
| Pro | Yearly | `com.gymsync.pro.yearly` | $149.90 |
| Premium | Monthly | `com.gymsync.premium.monthly` | $29.99 |
| Premium | Yearly | `com.gymsync.premium.yearly` | $299.90 |

Subscription-group rules:

- Premium is the higher service level.
- Pro is the lower service level.
- Monthly and yearly products for the same tier share a service level.
- Apple manages upgrades, downgrades, and prorated subscription changes.
- A seven-day introductory trial is configured in App Store Connect.
- StoreKit determines whether a customer is eligible for an introductory offer.
- The paywall only advertises a trial when Apple reports that the customer is eligible.

Product identifiers cannot be changed after the products are created in App Store Connect. Confirm the four identifiers before creating them.

## Phase 1: Native StoreKit Foundation

Create a single app-level billing provider using `expo-iap`.

Responsibilities:

- Establish and monitor the StoreKit connection.
- Load all configured subscription products.
- Receive purchase success and purchase error events.
- Recover unfinished StoreKit transactions after relaunch.
- Reconcile purchases after authentication and when the app enters the foreground.
- Expose products, connection status, entitlement status, purchase, restore, and management actions.
- Remove StoreKit listeners during cleanup.
- Reset user-specific billing state at sign-out.

StoreKit requires native code. Purchases will not work in Expo Go; testing requires an EAS development build, an Xcode native build, or TestFlight.

## Phase 2: Apple-Supplied Pricing and Offers

Replace production use of hard-coded paywall prices with StoreKit product metadata.

Use Apple's values for:

- Localized price and currency.
- Storefront-specific pricing.
- Subscription period.
- Introductory-offer availability.
- Trial duration and payment mode.

The existing catalog prices may remain as development fallbacks when StoreKit is unavailable. A production purchase button must remain unavailable until the selected StoreKit product has loaded.

Annual savings claims must be calculated from the actual monthly and yearly StoreKit prices. This prevents inaccurate claims when regional App Store pricing differs from the US catalog.

## Phase 3: Secure Purchase Flow

When a customer taps **Upgrade**:

1. Confirm that the customer is authenticated.
2. Confirm that StoreKit is connected.
3. Confirm that the selected product exists in Apple's product response.
4. Pass the authenticated Supabase user UUID to StoreKit as `appAccountToken`.
5. Ask StoreKit to present Apple's native purchase sheet.
6. Receive the resulting Apple-signed transaction.
7. Send the signed transaction to the authenticated GymSync backend.
8. Verify and persist the transaction on the backend.
9. Return the backend-computed entitlement.
10. Call StoreKit's `finishTransaction` only after verification succeeds.
11. Refresh app-wide entitlement state.
12. Show success and continue from the paywall.

Required UI outcomes:

- User cancelled: return to the idle state without showing an error.
- Pending approval: explain that access will unlock after Apple completes the purchase.
- Product unavailable: prevent purchase and show a useful message.
- Store or network failure: keep the current entitlement and offer retry.
- Verification failure: do not finish the transaction or grant access.
- Successful verification: update access immediately.
- Already owned: synchronize the existing subscription instead of attempting to grant access locally.

## Phase 4: Restore and Manage Purchases

The **Restore Purchases** action will:

1. Ask StoreKit to synchronize with the current Apple ID.
2. Retrieve available subscriptions.
3. Select transactions belonging to known GymSync products.
4. Submit relevant signed transactions to the backend.
5. Finish only successfully verified transactions.
6. Return the highest valid entitlement.
7. Report clearly when no GymSync purchase is found.

The **Manage Subscription** action will open Apple's subscription-management interface. Apple owns cancellation, renewal settings, payment-method changes, and plan-change confirmation.

## Phase 5: Supabase Billing Storage

Add a migration for verified Apple transactions. Proposed fields include:

- `user_id`
- `transaction_id`
- `original_transaction_id`
- `app_account_token`
- `product_id`
- `environment`
- `purchased_at`
- `expires_at`
- `revoked_at`
- `revocation_reason`
- `offer_type`
- `auto_renews`
- `created_at`
- `updated_at`

Storage requirements:

- Apple transaction IDs are unique.
- Reprocessing a transaction or notification is idempotent.
- Transactions remain as an audit history rather than being destructively overwritten.
- Only the service-role backend writes verified billing records.
- Customers cannot read or modify another customer's billing records.
- The current entitlement is derived from valid transaction state rather than trusted client flags.

## Phase 6: Billing API

### `GET /api/billing/entitlement`

Returns the backend-authoritative entitlement for the authenticated GymSync user.

Proposed response:

```json
{
  "tier": "pro",
  "period": "yearly",
  "renews_at": "2027-07-30T00:00:00Z",
  "in_trial": false,
  "auto_renews": true,
  "product_id": "com.gymsync.pro.yearly"
}
```

### `POST /api/billing/apple/verify`

Accepts a signed StoreKit transaction from an authenticated customer, verifies it, stores it, and returns the resulting entitlement.

Server verification must validate:

- Apple's JWS signature and certificate chain.
- The GymSync bundle identifier.
- Sandbox or Production environment.
- Production App Store Apple ID when required.
- Known product identifier.
- Transaction identifier.
- Purchase and expiration dates.
- Revocation or refund state.
- `appAccountToken` ownership against the authenticated Supabase user UUID.

Use Apple's official App Store Server Python library and Apple root certificates. GymSync will not receive or store the customer's card or Apple payment credentials.

## Phase 7: App Store Server Notifications V2

Add a public HTTPS endpoint for signed App Store Server Notifications V2.

Handle at least:

- Initial purchases.
- Renewals.
- Expirations.
- Billing retry and billing failures.
- Grace-period changes.
- Upgrades and downgrades.
- Refunds.
- Revocations.
- Auto-renewal status changes.

Every notification must:

1. Be verified using Apple's signature chain.
2. Be checked for the GymSync app and expected environment.
3. Be processed idempotently.
4. Update transaction state without trusting notification delivery order.
5. Recompute the affected user's entitlement.

This endpoint keeps backend access accurate when subscription state changes while the app is closed.

## Phase 8: App-Wide Entitlement State

Replace the current per-screen stub entitlement hook with a centralized provider.

The provider will:

- Hydrate from `GET /api/billing/entitlement`.
- Reconcile StoreKit transactions after sign-in.
- Refresh when the app returns to the foreground.
- Update immediately after purchase or restoration.
- Reset at sign-out.
- Avoid creating multiple StoreKit connections.
- Fall back to Free when verification fails.
- Never promote an entitlement based exclusively on device state.

The Settings plan label and paywall selection will consume the same entitlement state.

## Phase 9: Paid-Feature Enforcement

Client-side feature guards improve the experience, but the backend must remain the security boundary.

Backend work:

- Add a centralized `require_tier()` dependency/helper.
- Protect paid API capabilities using the verified entitlement.
- Add period-based usage records for quota-limited features.
- Enforce Pro's monthly voice-session allowance server-side.
- Treat Premium as unlimited only while its entitlement is active.
- Return explicit upgrade-required and quota-exhausted responses.

Client work:

- Hide or label unavailable capabilities appropriately.
- Open the paywall with the relevant recommended tier.
- Show remaining usage for quota-limited capabilities when useful.
- Refresh access after a completed upgrade.

This phase may be delivered as a second milestone after the purchase, restore, verification, and entitlement lifecycle is complete.

## Phase 10: Testing

### Frontend tests

- StoreKit connection unavailable.
- Product metadata missing.
- Localized price display.
- Trial eligible and trial ineligible states.
- User cancellation.
- Pending purchase.
- Store network error.
- Backend verification failure.
- Successful purchase.
- Restore with an active purchase.
- Restore with no matching purchase.
- Entitlement refresh after foregrounding.
- Sign-out state reset.

### Backend tests

- Valid Pro transaction.
- Valid Premium transaction.
- Expired transaction.
- Refunded or revoked transaction.
- Unknown product.
- Incorrect bundle identifier.
- Incorrect environment.
- Missing or incorrect `appAccountToken`.
- Duplicate transaction submission.
- Duplicate notification delivery.
- Notifications received out of order.
- Upgrade and downgrade precedence.
- Monthly versus yearly period mapping.
- Free trial detection.

### Native lifecycle testing

1. Test recoverable StoreKit cases with Xcode where applicable.
2. Test App Store sandbox transactions on a real device.
3. Test through TestFlight, which uses Apple's sandbox for purchases.
4. Verify production configuration before App Store release.

Test renewal, cancellation, refund, failed billing, interrupted purchase, restore, upgrade, and downgrade behavior—not only the happy path.

## Phase 11: App Store Connect Setup

Manual Apple configuration is required:

- Accept the Paid Apps Agreement.
- Complete banking and tax information.
- Confirm the GymSync App Store record and bundle identifier.
- Create the GymSync subscription group.
- Create all four subscription products.
- Set service levels for Pro and Premium.
- Add product display names and descriptions.
- Configure storefront pricing.
- Configure the seven-day introductory offer.
- Add App Store review metadata and screenshots when requested.
- Configure sandbox and production App Store Server Notification V2 URLs.
- Create sandbox tester accounts.
- Configure the backend's Apple app ID and trusted Apple root certificates.
- Deploy the Supabase billing migration and billing API.
- Generate a new native EAS development build after adding `expo-iap`.

## Phase 12: Verification and Delivery

Before marking the payment milestone complete:

- Run TypeScript type checking.
- Validate the Expo configuration.
- Run backend unit and regression tests.
- Review the Supabase migration and security policies.
- Validate the native iOS configuration/prebuild output.
- Perform the real-device sandbox test procedure.
- Confirm restore and subscription-management links.
- Confirm the paywall uses StoreKit prices and eligibility.
- Confirm paid access is granted only after backend verification.
- Confirm expiry or revocation removes access.

After verification, draft a milestone commit message and show it to the user. Do not commit or push until the user explicitly approves the message.

## Recommended Milestones

### Milestone 1: Secure Apple purchase lifecycle

- Native StoreKit connection.
- Apple product metadata and localized pricing.
- Purchase and restore flows.
- Backend JWS verification.
- Supabase transaction storage.
- Backend-authoritative entitlement state.
- App Store Server Notifications V2.
- Sandbox and TestFlight verification.

### Milestone 2: Paid-feature enforcement

- Backend tier authorization.
- Pro usage quotas.
- Premium unlimited-access rules.
- Upgrade prompts and quota UX.
- Enforcement tests.

## Open Decisions

Confirm before implementation proceeds:

1. Whether the four current product IDs are final and have not already been created under different identifiers.
2. Whether the current prices are final or placeholders for App Store price-point selection.
3. Whether the seven-day trial applies to all four products in the subscription group.
4. Whether paid-feature enforcement is part of the first milestone or a separate second milestone.
5. Whether Android billing should remain out of scope for this implementation.


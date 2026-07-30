# In-App Purchases — what you have to do by hand

The code is written. This is everything a machine couldn't do for you, in the order
it matters.

---

## 1. Right now, to test it (≈10 minutes)

### a. Apply migration 013 to Supabase — **required, nothing works without it**

`backend/supabase/migrations/013_billing.sql` creates the three billing tables and the
`increment_feature_usage()` function. Until it's applied, every entitlement read fails
and everyone is Free.

Run it in the Supabase SQL editor (or via the Management API route you've used before).
It is idempotent — `CREATE TABLE IF NOT EXISTS` throughout — so it's safe to re-run.

Afterwards, confirm all three exist:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('apple_transactions','apple_subscription_owners','feature_usage');
```

> The SQL was parsed against the Postgres dialect but **never executed** — there's no local
> Postgres or Docker on this machine. Applying it is the first real test of it.

### b. Start the backend

```bash
cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

It must be started from `backend/` — `env_file=".env"` is a relative path.

`backend/.env` already has the Apple block. If the server refuses to start, that's the
billing config guard doing its job; the message says which setting is wrong.

### c. Run the app

```bash
npx expo run:ios
```

Not an EAS build — a local one. The StoreKit configuration is attached to the **Xcode
scheme**, and an EAS dev client can't pick it up.

### d. Buy something

Open Settings → Plan. You should see real prices from the `.storekit` file and a live
"7 days free trial". Tap Upgrade and Apple's sheet appears.

Then in Xcode: **Debug → StoreKit → Manage Transactions** to refund, expire, or force a
renewal and watch the entitlement follow.

Worth walking, in this order:

| What to do | What should happen |
|---|---|
| Buy Pro monthly | Settings shows "Pro"; a row lands in `apple_transactions` |
| Open the paywall again | The trial line is **gone** — eligibility is per group, and it's spent |
| Upgrade Pro → Premium | Settings shows "Premium"; the old row gets `is_upgraded` |
| Refund it in Transaction Manager | Access drops back to Free |
| Kill the app mid-purchase | It reconciles on next launch |
| Turn on airplane mode, buy | "Purchase complete — activating…", not an error |
| Sign out | Entitlement resets to Free |

And on a **free** account: try a voice session (refused), send 11 chat messages (11th
refused), generate a second plan (refused), change coach in Settings (refused).

---

## 2. When you're ready to sell — the Apple checklist

None of this can start until the **Paid Apps Agreement** is signed, and that involves
Apple-side review measured in days. Start it before you need it.

In App Store Connect:

1. **Business → Agreements**: accept the Paid Apps Agreement.
2. **Business**: banking details and tax forms. Apple will not release a single payment
   without these, and they take longer than you'd expect.
3. Create the **app record** for `com.yoshinishikawahara.gymsync`.
4. **Subscriptions → create a group** named `GymSync Membership`.
5. Create **four subscriptions** with these product IDs, exactly:

   | Product ID | Service level | Price |
   |---|---:|---:|
   | `com.yoshinishikawahara.gymsync.premium.yearly` | 1 | $299.90 |
   | `com.yoshinishikawahara.gymsync.premium.monthly` | 2 | $29.99 |
   | `com.yoshinishikawahara.gymsync.pro.yearly` | 3 | $149.90 |
   | `com.yoshinishikawahara.gymsync.pro.monthly` | 4 | $14.99 |

   **Product IDs are permanent.** They cannot be renamed or reused, ever. Check them twice.

   **Four distinct service levels, not two.** If Premium-yearly and Premium-monthly share a
   level, Apple treats monthly→yearly as a crossgrade and defers it to the next renewal
   instead of charging a prorated upgrade immediately.

6. Add an **introductory offer** on the group: 7 days, free, for new subscribers.
7. Add display names and descriptions per product (App Review rejects blanks).
8. **Users and Access → Sandbox Testers**: create at least one, with an email that isn't
   already an Apple ID.
9. Note the app's **numeric Apple ID** from the App Information page.

Then switch the backend off local testing:

```dotenv
APPLE_ENVIRONMENTS=Sandbox          # TestFlight; use Production,Sandbox for the App Store
APPLE_ALLOW_LOCAL_TESTING=false
APPLE_APP_ID=<the numeric id>
```

The server **refuses to start** if you leave local testing on with `APP_ENV=production`.
That's deliberate: unsigned transactions would otherwise be accepted as real purchases.

---

## 3. Things that need a deployed backend

The backend isn't hosted anywhere — no Dockerfile, no render.yaml. Two features wait on that:

- **App Store Server Notifications V2.** Needs a public HTTPS URL. Deliberately not written
  yet: it can't be reached or tested, and it's exactly the code that gets rewritten once real
  notifications start arriving. The database columns it needs already exist.
- **App Store Server API** (a `.p8` key). This is what would let the server see renewal info.

**What that costs you today, stated plainly:** subscription changes that happen while the app
is closed — renewals, cancellations, refunds — are picked up on the next foreground refresh
rather than pushed. And because renewal info only exists in the App Store Server API, a
customer whose card fails drops to Free immediately, while Apple's own UI still shows them
subscribed for up to 16 days.

The alternative — a blind 16-day grace window on the server — was considered and rejected:
it would over-grant on every genuine lapse, with no signal to ever take it back.

---

## 4. What a local `.storekit` file cannot prove

Worth knowing before you trust a green run:

- **Any signature at all.** Apple's library skips certificate-chain verification for `Xcode`
  transactions, because they're signed by a local test certificate. The chain, the Apple roots,
  and OCSP are all unexercised. (`backend/tests/test_billing_apple.py` covers the *refusal*
  side of this — that a forged transaction can't slip through in production.)
- App Store Server Notifications, the App Store Server API, Family Sharing, promo codes.
- Real storefront pricing and currency.
- Real per-Apple-ID trial eligibility — locally it just reads the local transaction database.
- **Whether the product IDs match App Store Connect.** A `.storekit` file accepts any IDs.
  `tools/generate-storekit.mjs` derives them from `catalog.ts` so they can't drift from the
  app, but nothing can check them against App Store Connect until the products exist.

---

## 5. If you change prices or product IDs

`src/screens/pricing/catalog.ts` is the single source. After editing it:

```bash
node tools/generate-storekit.mjs          # regenerate
node tools/generate-storekit.mjs --check  # fails if they've drifted
```

Product IDs must also be changed in App Store Connect — and once created there, they can't be.

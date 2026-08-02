# Submitting GymSync to the App Store

Everything in the codebase is ready. What's left is App Store Connect work, one
credential rotation, and one thing that has never actually been tested.

Work top to bottom — the order matters, because step 2 gates the review itself.

---

## 1. Rotate the test-account password — 2 minutes

Open since the first security pass. `estate+gymsynccurl@scissors-corp.jp` had its
password committed in plaintext to a public repo. Removing it from the file did
not un-leak it.

1. [supabase.com/dashboard](https://supabase.com/dashboard) → project →
   **Authentication → Users**
2. Find that address → **⋯ → Reset password** (or set one directly)
3. Store the new password in your password manager — **not** back in a repo file
4. Confirm **2FA is OFF** for this account (see step 2)

It must satisfy `backend/app/password.py`: 8+ characters, and it is normalised
before being checked against a common-password blocklist.

**Keep this password to hand — step 2 needs it.**

---

## 2. Test the signup email — 10 minutes

**The single highest-risk untested path.** Custom SMTP is configured but has
never delivered a real message. If confirmation email is broken, an App Review
reviewer cannot get into your app, and that is a rejection rather than a retry.

1. Sign up in the app with a **fresh** address you control
2. Confirm the email arrives — **from your domain**, not in spam
3. Click the link and confirm the account activates
4. Then trigger **Forgot password** and confirm that email arrives too

If either lands in spam, check the Resend dashboard for delivery status before
submitting. DKIM, SPF and DMARC are all published correctly, so it should be
clean.

---

## 3. App Store Connect — the review-blocking fields

### App Review Information

Give the reviewer a working account, or they cannot see your app at all:

- **Sign-in required:** Yes
- **Username:** `estate+gymsynccurl@scissors-corp.jp`
- **Password:** the one from step 1
- **2FA must be OFF** on it. A reviewer cannot receive your second factor.

**Notes field** — worth writing, because a reviewer who can't find the paywall
may reject for "incomplete functionality":

> GymSync is an AI fitness coach. Subscriptions are reachable from
> Settings → Plan. Live voice coaching (Pro and above) is on the Sync tab.
> Knowledge search with cited sources is a Premium feature — ask the coach a
> technique question such as "why does my lower back round when I deadlift".

### Privacy questionnaire

**Mandatory.** It must match `docs/privacy-policy.md` and the manifest now
declared in `app.json`. Declare each of these as **linked to the user** and
**not used for tracking**:

| Data | Why |
|---|---|
| Email address | account |
| Name | display name |
| User ID | account id |
| Health | sex, age, height, weight |
| Fitness | plans, sets, reps, body-weight log |
| Audio data | live voice coaching |
| Photos | profile picture |
| Other user content | coach conversations |
| Crash data | Sentry |

Answer **No** to every tracking question. There is no ad SDK, no attribution,
no ATT prompt.

**Privacy policy URL:** `https://gymsyncapp.me/privacy-policy` (live, verified)

### Subscriptions — verify, do not re-enter

These already exist (your sandbox purchases proved it). Check the prices match
exactly — **App Store prices cannot be changed freely later**:

| Product ID | Price |
|---|---|
| `com.yoshinishikawahara.gymsync.pro.monthly` | **$14.99** |
| `com.yoshinishikawahara.gymsync.pro.yearly` | **$149.00** |
| `com.yoshinishikawahara.gymsync.premium.monthly` | **$29.99** |
| `com.yoshinishikawahara.gymsync.premium.yearly` | **$299.00** |

Each carries a **7-day free trial** as an introductory offer.

Confirm too: **Paid Apps Agreement** accepted, and banking and tax filled in.
Without those, subscriptions cannot be sold no matter what else is right.

### Store listing

Screenshots, description, keywords, support URL, category. Design tokens for
your screenshots are in `src/theme/` — brand blue is `#2E90EA`, the typeface is
Inter.

---

## 4. Build and submit

```bash
cd /Users/yoshi/Documents/Programming/Projects/GymSync/GymSync/gymsync-app
eas build --platform ios --profile production
eas submit --platform ios
```

The production profile uploads source maps to Sentry, so a crash in review
arrives with a readable stack trace instead of a minified one.

---

## 5. On the day you submit

**Check the backend is up.** You run a single machine. If it is down when a
reviewer opens the app, that is a rejection, not a retry:

```bash
curl https://gymsync-api.fly.dev/health     # {"status":"ok"}
fly status -a gymsync-api                   # started, checks passing
```

**Watch it during review.** Reviews usually land within 24–48 hours:

```bash
fly logs -a gymsync-api
```

Sentry will email you if the app crashes for a reviewer.

---

## Already done — no action needed

- In-app account deletion with step-up reauthentication (App Review 5.1.1(v))
- Restore Purchases, and Manage Subscription in Settings
- Sign in with Apple, required because Google sign-in is offered
- Privacy policy and Terms, live and in-app, accurate about Deepgram, Sentry
  and social sign-in
- Privacy manifest declaring all nine collected data types
- Backend deployed with TLS, API schema not public in production
- Crash reporting on both client and server
- Version set to `1.0.0`

## Deliberately deferred

No analytics, no review prompt, no data-export flow. None blocks submission.
Analytics is the one to add soon after launch — without it you cannot see where
people drop out of a 19-question onboarding flow.

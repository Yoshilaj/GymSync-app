# Submitting GymSync to the App Store

Everything in the codebase is ready. What's left is App Store Connect work.

---

## 1. The review account — done, 2026-08-02

The old test account (`estate+gymsynccurl@scissors-corp.jp`) had its password
committed in plaintext to a public repo, and was later deleted from Supabase.
Deleting it was clean: every user-owned table is `REFERENCES auth.users ON
DELETE CASCADE`, so no orphan rows survive. The one exception is the `avatars`
bucket — `account.py` purges `avatars/{user_id}/` on the in-app delete path
precisely because no foreign key reaches object storage, and a dashboard delete
skips that. Sweep the bucket eventually; the naming user_id is unrecoverable.

Replaced by **`gymsyncreview@gmail.com`**, created through the app's normal
email/password signup so the account carries real onboarding data and a built
plan. Password is in the password manager, not in this repo.

Deliberately on **Gmail, not the app's own domain**: `gymsyncapp.me` mail is
handled by a service Namecheap can't edit, and changing MX there would risk the
DKIM/SPF/DMARC records the signup mail depends on. Not worth it days before
submission. `scissors-corp.jp` rejects plus-addressing, so that route was out.

## 2. Signup email — verified working, 2026-08-02

Custom SMTP had never delivered a live message. It has now: signup confirmation
and password reset both arrived in a **Gmail inbox, not spam**, which is the
harshest deliverability test available. This was the highest-risk unknown in the
submission and it is now proven rather than assumed.

---

## 3. App Store Connect — the review-blocking fields

### App Review Information

Give the reviewer a working account, or they cannot see your app at all:

- **Sign-in required:** Yes
- **Username:** `gymsyncreview@gmail.com`
- **Password:** the GymSync password from the password manager — *not* the
  Gmail one
- **2FA must be OFF** on it. A reviewer cannot receive your second factor.
- **Attachment:** none needed. That field is for demo videos when a feature is
  hard to reach; sign-in is one tap from the first screen.

**Notes field** — worth writing, because onboarding runs *before* signup here. A
reviewer who taps "Get started" out of habit lands in 19 onboarding questions and
may never reach the account you gave them:

> GymSync is an AI fitness coach.
>
> Onboarding runs before account creation, so please tap "Log in" on the first
> screen and use the credentials above — this account already has a training
> plan set up.
>
> Subscriptions are reachable from Settings → Plan. Live voice coaching (Pro and
> above) is on the Sync tab. Knowledge search with cited sources is a Premium
> feature — ask the coach a technique question such as "why does my lower back
> round when I deadlift".
>
> To see the new-user onboarding flow, tap "Get started" on the first screen
> instead.

`WelcomeScreen.tsx` puts **Log in** on the first screen beside **Get started**,
so onboarding never blocks a reviewer. The `OnboardingPreview` and Sync debug
routes are `__DEV__`-gated and are stripped from the production build.

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

**Before submitting, re-read the description against Guideline 3.1.2.** It must
contain a functional **Terms of Use (EULA)** link, a functional Privacy Policy
link, and each subscription's **name, length and price** plus the auto-renewal
terms. Paste the description from `docs/APP_STORE_LISTING.md` whole — the
`SUBSCRIPTION DETAILS` block and the two link lines at the end are the compliance
part, not decoration.

Build 2 was rejected on **2026-08-06** for omitting the Terms of Use link. That
rejection never reached functional review — Apple blocks on metadata first — so
it cost a full round trip for one missing line. Verify the links resolve before
you submit:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -L \
  https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
curl -s -o /dev/null -w '%{http_code}\n' -L https://gymsyncapp.me/privacy-policy
```

Leave ASC's **License Agreement** field on Apple's standard agreement. Do not
register `terms-of-service` as a custom EULA — reasons in
`docs/APP_STORE_LISTING.md`.

---

## 4. Build and submit

```bash
cd /Users/yoshi/Documents/Programming/Projects/GymSync/GymSync/gymsync-app
eas build --platform ios --profile production
```

**Before submitting — MANDATORY, this is what the build-3 rejection was:**

1. In the build logs, confirm the `[check-env] ok — all 6 vars present` line
   from the pre-install hook. If the build failed there, the EAS environment
   variables are missing — see `docs/DEPLOY.md` §4.
2. Download the IPA from the build page and prove the configuration is inside
   the binary:

   ```bash
   tools/verify-ipa-bundle.sh ~/Downloads/build-XX.ipa   # must print PASS
   ```

3. Install THAT build via TestFlight on a physical device, **deleting any
   previous install first** (App Review installs fresh), and cold-launch it:
   blue splash → sign-in screen, with both Apple and Google buttons visible.
   Also cold-launch once in airplane mode — it must reach the sign-in screen,
   not sit on the splash.

Only then:

```bash
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

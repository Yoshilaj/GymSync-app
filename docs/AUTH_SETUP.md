# Auth setup — the console work the code can't do

Everything here is dashboard/console configuration. The app code is written and
committed; these are the values it needs to actually work. Ordered by what blocks
what.

---

## 1. Supabase → Auth → Sessions  ✅ done

Access-token TTL lowered from 3600s. This bounds the window in which a signed-out
user's access token still verifies, because the backend now checks tokens locally
instead of asking GoTrue on every request (`backend/app/jwt_verify.py`).

---

## 2. Apply migration 014

`backend/supabase/migrations/014_profile_on_signup.sql` — **applied** (verified against
the live database 2026-08-01: 5 auth users, 5 profiles, no gaps).

Creates the `on_auth_user_created` trigger so every new account gets a `profiles`
row, and backfills anyone missing one. Until it runs, **a social sign-in produces an
account with no profile**: the old seed lived inside `POST /api/auth/signup`, which
Apple and Google never touch.

Apply it in the SQL editor (it's idempotent). Then confirm:

```sql
select tgname from pg_trigger where tgname = 'on_auth_user_created';
select count(*) from auth.users u
  left join profiles p on p.user_id = u.id where p.user_id is null;  -- expect 0
```

---

## 2b. Apply migration 015

`backend/supabase/migrations/015_mfa_flag.sql` — **applied** (verified against the live
database 2026-08-01: `profiles.mfa_enabled` exists).

Adds `profiles.mfa_enabled`, which is how the backend knows a second factor is
*required* (the token only says whether one was *used*). Until it runs, **two-factor
enforcement is inert**: the backend logs a warning at first use and treats every
account as 2FA-off, and the enrollment endpoint returns 502 rather than let someone
believe they've turned on protection that isn't recorded.

That degradation is deliberate so this code could ship ahead of the migration
without 503-ing every request — but it does mean 2FA does nothing until you run it.

```sql
select column_name from information_schema.columns
 where table_name = 'profiles' and column_name = 'mfa_enabled';   -- expect 1 row
```

---

## 3. Sign in with Apple

**Supabase → Auth → Providers → Apple.** Exactly one field matters:

| Field | Value | Why |
|---|---|---|
| Enable Sign in with Apple | on | |
| **Client IDs** | `com.yoshinishikawahara.gymsync` | The bundle ID. Comma-separated list — a web Services ID would go here too, if one ever existed. |
| Secret Key (for OAuth) | **leave blank** | Web-OAuth only. The native flow sends an identity token that Supabase verifies against Apple's public keys, checking `aud` against the Client IDs above. No secret is involved. |
| Allow users without an email | **leave off** | See below. |
| Callback URL | nothing to do | Web redirect target; unused here. |

**Ignore the "Apple OAuth secret keys expire every 6 months" warning.** It refers to
the Secret Key field, which is empty and unused — there is nothing to rotate.

**Why "allow users without an email" stays off.** Sign in with Apple always returns
an email claim (a `@privaterelay.appleid.com` address when the user picks Hide My
Email), so the toggle buys nothing. It costs something, though: it permits accounts
with a null email, and `backend/app/routers/account.py` refuses to delete an account
that has neither an email to reauthenticate against nor a second factor. In-app
account deletion is mandatory under App Review 5.1.1(v), so an undeletable account is
a rejection waiting to happen. Off keeps every account deletable.

**Apple Developer portal**: the App ID needs the **Sign In with Apple** capability
enabled, or the entitlement won't provision and the EAS build fails at signing.
`app.json` already sets `ios.usesAppleSignIn` and the `expo-apple-authentication`
plugin, so nothing else is needed in the project.

> Apple only ever returns the user's name on the **first** authorization for a
> given Apple ID. The code captures it there and writes it to user metadata
> (`src/auth/social.ts`). If you test with an Apple ID that has authorized this
> bundle before, you'll get no name — revoke it under Settings → your name →
> Sign in with Apple to test the first-run path again.

---

## 4. Sign in with Google

**Google Cloud Console → APIs & Services → Credentials**, create two OAuth client IDs:

| Type | Used by | Goes in |
|---|---|---|
| **iOS** (bundle `com.yoshinishikawahara.gymsync`) | the native sheet | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` + `app.json` |
| **Web application** | Supabase, to validate the token audience | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` + Supabase |

These are **not interchangeable**. Configuring only the iOS one produces the most
confusing possible failure: the native sheet succeeds, then Supabase rejects the
token.

Then:

1. **Supabase → Auth → Providers → Google**: enable, put the **Web** client ID in
   "Client IDs" (no client secret needed for the native ID-token flow), and turn on
   **"Skip nonce checks"**.

   That last one is not optional here, and the failure without it is opaque:
   sign-in dies with *"Passed nonce and nonce in id_token should either both exist
   or not."* `@react-native-google-signin` exposes no way to set a nonce — the
   string doesn't appear anywhere in the package (v16.1.4) — while Google's iOS SDK
   puts one in the token regardless. Supabase sees a nonce it can't match against
   anything and refuses. The toggle exists for exactly this class of native SDK.
   The cost is replay protection on the ID token, mitigated by Google's tokens
   being short-lived, audience-bound to your client ID, and carried over TLS.
2. `.env`: set both `EXPO_PUBLIC_GOOGLE_*` values. If either is missing the Google
   button is not rendered at all — deliberately, so a build can never show a button
   that cannot work.
3. **`app.json`**: replace the placeholder in the google-signin plugin —

   ```json
   ["@react-native-google-signin/google-signin",
    { "iosUrlScheme": "com.googleusercontent.apps.REPLACE_WITH_REVERSED_IOS_CLIENT_ID" }]
   ```

   The value is the iOS client ID with its two halves swapped, e.g. client ID
   `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`.
   It's also the `REVERSED_CLIENT_ID` in the plist Google gives you.

> **App Review 4.8**: offering Google makes Sign in with Apple mandatory. They ship
> together or not at all. If you'd rather not deal with Google's console right now,
> leave the env vars empty — Apple alone is a valid, compliant configuration.

---

## 5. New EAS dev-client build — required

`expo-apple-authentication`, `expo-crypto` and `@react-native-google-signin/google-signin`
are native modules. **None of section 3 or 4 is testable on the current build**, and
Metro will not error — the buttons just won't work.

Build *after* filling in `iosUrlScheme`, since it's compiled into Info.plist.

---

## 6. Custom SMTP — a launch blocker

Supabase's built-in mailer is capped at roughly **2–3 emails per hour**, project-wide.
That's survivable for one developer and breaks on day one in production: signup,
password reset and email change all send. Past the cap, GoTrue returns 429 and the
user sees a failure with no email — the worst version of this, because it looks like
the app is broken rather than rate-limited.

1. **Resend** (or Postmark) account, then add and verify your sending domain. This is
   the step with a wait in it — DNS propagation — so start it first.
2. Add the DKIM and SPF records Resend gives you. Skipping these is how a correctly
   configured mailer still lands in spam.
3. **Supabase → Auth → SMTP Settings**, enable custom SMTP:

   | Field | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | your Resend API key |
   | Sender email | something at your verified domain, e.g. `no-reply@gymsyncapp.me` |
   | Sender name | `GymSync` |

   Don't send from a free-mail address — it fails DMARC alignment and gets filtered.
4. **Auth → Rate Limits**: raise the email limit, which stays at the built-in
   default even after custom SMTP is configured. That default is the actual cap.
5. **Auth → Email Templates**: paste in the three templates from
   `backend/supabase/email-templates/`, with the subject lines listed in that
   directory's README.

**Verify it:** create an account with a throwaway address, confirm the mail arrives
and looks right on a phone, then send ten signups within five minutes and check that
all ten land. Run one through [mail-tester.com](https://www.mail-tester.com) — a score
below 8 usually means SPF or DKIM isn't aligned.

---

## 7. Backend environment for production

Two settings that are inert in development and matter the moment this is deployed
behind anything:

```bash
# Browser origins allowed to call the API. Empty is correct for a native-only app —
# React Native sends no Origin header and isn't subject to CORS. Set this ONLY if a
# web client appears.
CORS_ORIGINS=

# Set to true ONLY when a proxy YOU control appends X-Forwarded-For (a load
# balancer, Cloudflare, nginx). Left false, the header is ignored and rate limits
# key on the socket address — because otherwise anyone can set X-Forwarded-For to a
# fresh value per request and hand themselves an unlimited budget.
TRUSTED_PROXY=false

# "production" also switches CORS from the permissive dev default to CORS_ORIGINS
# and refuses to boot on an unsafe billing configuration.
APP_ENV=production
```

Rate limits are in-memory, so with N uvicorn workers — or N Fly machines — a limit
of 10 is effectively 10N. That's fine at one worker, which is where this is today,
and both `backend/Dockerfile` (`--workers 1`) and `backend/fly.toml`
(`auto_stop_machines = false`, one machine) hold it there deliberately.

**Setting `REDIS_URL` does not lift that constraint.** `RedisCache` in
`app/cache.py` is still a stub that raises, so the process now refuses to start
when `REDIS_URL` is set rather than pretend the limits became shared — that
false belief is what would make it feel safe to add a second machine. Implement
`RedisCache` first, then scale.

---

## Test account

`estate+gymsynccurl@scissors-corp.jp` — password is **not** recorded here.

It used to be, in plaintext, in this tracked file. That is a working credential on
the live Supabase project, so it now lives in your password manager alongside
everything else. Put it in `backend/.env` as `TEST_ACCOUNT_PASSWORD` if a script
needs it; `.env` is gitignored.

Note the password rules when you set a new one: it must clear
`backend/app/password.py`, which normalises the input before checking it against a
common-password blocklist — the original test password normalised to "password" and
would be rejected today.

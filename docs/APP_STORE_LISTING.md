# App Store listing copy — v1.0.0

Paste-ready text for the 1.0.0 version page. Character counts are Apple's hard
limits; each block below is within them.

---

## App Name — 26 / 30

```
Gym Sync AI: Workout Coach
```

**Keep the space in "Gym Sync".** The App Store tokenises on word boundaries, so
`GymSync` is a single token that will not match a search for *gym*. `Gym Sync AI`
gives you three indexable tokens — *gym*, *sync*, *ai* — in the highest-weighted
field there is. The in-app branding stays `GymSync`; a store name that differs in
spacing from the on-device name is normal and permitted.

## Subtitle — 29 / 30

```
Voice Coach & Workout Tracker
```

*workout tracker* is one of the highest-volume phrases in the category, and
*voice* is the one word that separates this app from every other AI fitness app.

## Keywords — 100 / 100

```
fitness,personal,trainer,strength,lifting,muscle,exercise,log,routine,plan,hypertrophy,rep,set
```

Rules applied: comma-separated with no spaces, no plurals (Apple stems them), no
word repeated from the name or subtitle, and no category name. *personal* and
*trainer* are split rather than written as a phrase so Apple can recombine them
with other terms.

## Promotional Text — 149 / 170

Editable any time without review — use it for launch messaging later.

```
Your coach talks you through every set, hands-free. Say your reps out loud and they're logged. Built on real training science, not generic templates.
```

---

## Description — 2,537 / 4,000

The `SUBSCRIPTION DETAILS` block and the two link lines at the end are not
optional copy — Guideline 3.1.2 requires them. See "Rules this copy follows".

```
Most fitness apps hand you a plan and walk away. GymSync stays with you through
the set.

Put in an earbud and your coach talks you through the workout — calling the next
exercise, timing your rest, adjusting when a set goes badly. Say what you lifted
and it's logged. You never touch the screen with chalky hands.

A COACH THAT LISTENS
Talk to your coach mid-workout the way you'd talk to a trainer standing next to
you. Ask why the last set felt heavy, say you want to swap an exercise, or just
say you're done. It hears you and answers.

A PLAN BUILT AROUND YOU
Answer a few questions about your goal, your schedule and the equipment you can
actually reach. GymSync builds your plan from that, then keeps editing it as you
train. Miss a week and it adapts instead of guilt-tripping you.

COACHING BACKED BY EVIDENCE
Ask a technique question and get an answer drawn from published strength and
conditioning research, with its sources shown. No confident guessing.

IT REMEMBERS
Your coach remembers the shoulder that bothered you in spring, the exercise you
quietly hate, and every weight you have ever lifted. Progression comes from your
own logged sets, not a generic percentage.

TRACK WHAT MATTERS
• Log sets, reps and weight in seconds — by voice or by tap
• Body-weight logging with trend charts that smooth out daily noise
• Strength curves for every exercise, over months

CHOOSE YOUR COACH
Some people need encouragement. Some need to be told to stop making excuses.
Pick the coach personality that actually gets you to the gym.

GETTING STARTED
Build a plan, log your workouts and track your progress without paying anything.
Add live voice coaching when you want a coach in your ear for every set, and
unlimited voice, evidence-based answers, injury-aware programming and lifetime
memory when you want the whole coaching brain.

SUBSCRIPTION DETAILS
GymSync Pro — $14.99 per month or $149.00 per year.
GymSync Premium — $29.99 per month or $299.00 per year.
Each subscription starts with a 7-day free trial and renews automatically at the
price above unless cancelled at least 24 hours before the period ends. Payment is
charged to your Apple ID account on confirmation. Manage or cancel any time in
your Apple ID settings, or from Settings inside the app. Prices are in USD and
may vary by storefront.

Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://gymsyncapp.me/privacy-policy

Questions? Reach us from Settings → Contact support, and a real person replies.
```

---

## Fields still to fill

| Field | Value |
|---|---|
| Primary category | Health & Fitness |
| Secondary category | *(optional — leave blank)* |
| Copyright | `2026 Yoshiharu Nishikawahara` |
| Privacy Policy URL | `https://gymsyncapp.me/privacy-policy` |
| Terms of Use (EULA) | Apple standard, linked in the Description — leave ASC's License Agreement field alone |
| Support URL | **see note below** |
| Marketing URL | optional |
| Screenshots | the five `1320x2868` files in `marketing/app_preview/` |

### Support URL

Apple's Support URL field takes a **web page, not an email address** — so this
is not blocked on the `support@gymsyncapp.me` mailbox. `https://gymsyncapp.me`
satisfies the field today.

The mailbox is a separate problem and still needs solving: `appInfo.ts` sets
`SUPPORT_EMAIL = 'support@gymsyncapp.me'`, the in-app Contact support screen
tells users "a real person usually replies within a day", and the privacy policy
commits to answering rights requests there within 30 days. If that address does
not deliver, all three are promises the app cannot keep.

---

## Rules this copy follows

- No "best", "#1", or unprovable superlatives
- No competitor names (a rejection risk in the keyword field especially)
- The free tier and the trial are both stated, which Apple expects when an app
  gates features behind a subscription
- **Guideline 3.1.2 metadata block is mandatory** — see below

### The 3.1.2 block — learned the hard way, 2026-08-06

1.0.0 build 2 was **rejected** on 2026-08-06 with:

> The submission offers auto-renewable subscriptions but does not include a
> functional link to the Terms of Use (EULA) in the app's metadata.

This version of the doc previously carried two rules that caused it:

- ~~No URLs in the description body — they do not render as links~~ — **wrong on
  both counts.** URLs in App Store descriptions *do* render as tappable links,
  and Apple *requires* a functional Terms of Use link there for any app with
  auto-renewable subscriptions.
- ~~No prices in the description — they change per storefront and per currency~~
  — a fair ASO instinct, but Guideline 3.1.2 outranks it. The storefront problem
  is solved by naming USD and saying prices may vary, not by omitting price.

Guideline 3.1.2 requires the description to state, for every auto-renewable
subscription: **title, length, price**, the auto-renewal terms, and **functional
links to both the Terms of Use (EULA) and the Privacy Policy**. Do not trim the
`SUBSCRIPTION DETAILS` block or the two link lines out of the description.

We link **Apple's standard EULA**, not `gymsyncapp.me/terms-of-service`. Our own
ToS ships in-app as a supplementary agreement, but it satisfies only about half
of Apple's *Minimum Terms of Developer's EULA* (Schedule 1 of the Paid Apps
Agreement) — it is missing the "Apple is not a party" acknowledgement, the
warranty clause where Apple refunds the purchase price, product-claims and
IP-infringement responsibility, and the embargoed-country representation.
Registering it as a custom EULA in App Store Connect would invite a second
rejection. If we ever want a custom EULA, those five clauses go in first.

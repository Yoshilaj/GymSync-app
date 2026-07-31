# Email templates

Source of truth for the transactional emails Supabase sends. They are configured in
the dashboard (Auth → Email Templates), which means they live outside version
control there — so they live here, and the dashboard gets a copy.

| File | Dashboard template | Sent when |
|---|---|---|
| `confirm-signup.html` | Confirm signup | a new account is created |
| `reset-password.html` | Reset password | `POST /api/auth/reset-password` |
| `change-email.html` | Change email address | the settings screen changes an address |

## Why they look the way they do

**Tables, inline styles, no external anything.** Gmail strips `<style>` blocks,
Outlook renders through Word, and most clients block remote images by default. Every
rule is inline and the "logo" is drawn with a background colour and a text
character, so there is no image to block and nothing to load. The one thing an email
must do — be readable and have a working button — survives all of it.

**One button, one link.** Under it, the same URL as plain text, because a
non-trivial share of clients will not render the button as clickable. Below that,
what to do if you didn't ask for this. That third line is the security-relevant one
and it is why none of these say "click here to verify" and stop.

**No dark-mode media query.** `prefers-color-scheme` is honoured by roughly half of
clients and *inverted* by some of the rest, which produces worse results than
committing to one palette. These commit to a light card that stays legible when a
client force-inverts it.

**The subject lines matter more than the body.** They're set in the dashboard beside
each template:

| Template | Subject |
|---|---|
| Confirm signup | `Confirm your GymSync account` |
| Reset password | `Reset your GymSync password` |
| Change email | `Confirm your new email address` |

No emoji, no "Action required", nothing that reads as marketing — these are the
emails that must not land in spam.

## Variables

Supabase substitutes these server-side:

- `{{ .ConfirmationURL }}` — the link. Already carries `redirect_to`, so it lands on
  `gymsync://auth-callback` and the app takes over (see `src/auth/deepLinks.ts`).
- `{{ .Email }}` — the recipient. Used to say *which* address this concerns, which
  is what makes a change-email confirmation intelligible.
- `{{ .SiteURL }}`, `{{ .Token }}`, `{{ .TokenHash }}` — available, unused here.

## A note on the reset link

`{{ .ConfirmationURL }}` redirects through `/auth/v1/verify`, which mints a recovery
session and hands it to the app in the URL fragment. The alternative — a
`{{ .TokenHash }}` the app exchanges itself via `verifyOtp` — keeps tokens out of
redirect URLs and is worth moving to later. It needs the app to parse a different
shape, so it isn't a template-only change.

## Applying

Auth → Email Templates, paste each file's contents, set the subject from the table
above. There is no API for this; it is dashboard-only.

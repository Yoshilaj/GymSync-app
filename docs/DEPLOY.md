# Deploying the GymSync API

Everything here is a manual step. Nothing in this repo deploys automatically —
there is no CI, by choice for now.

Run every `fly` command from `backend/`. That's where `fly.toml` and the
`Dockerfile` live, and `fly` resolves both relative to the working directory.

---

## 0. Once, on your machine

```bash
brew install flyctl
fly auth signup     # or: fly auth login
```

Fly has **no free tier** — it ended in 2024. Adding a card is unavoidable.
Expect roughly **$6–7/month** for the single 1 GB always-on machine `fly.toml`
asks for. See "Why it costs that" at the bottom if you want to trim it.

---

## 1. Create the app — without deploying yet

```bash
cd backend
fly launch --no-deploy
```

Answer its prompts like this:

| Prompt | Answer | Why |
|---|---|---|
| Copy existing config? | **Yes** | `fly.toml` is already written and its settings are load-bearing |
| Tweak settings? | **No** | The web wizard will happily undo the memory and auto-stop choices |
| App name | `gymsync-api`, or pick another | If you change it, `fly.toml`'s `app =` line is rewritten for you |
| Region | `nrt` (Tokyo) is preset | Pick the one nearest your **users**, not you |
| Postgres / Redis / Tigris? | **No** to all | Supabase is the database; Redis is not implemented (step 2) |

It won't deploy — that's the point. Secrets have to exist first.

---

## 2. Set the secrets

Six are required. The server refuses to start without any of them, because
`app/config.py` declares them with no default.

Read the values out of your local `backend/.env`:

```bash
cd backend
fly secrets set \
  SUPABASE_URL="..." \
  SUPABASE_SERVICE_ROLE_KEY="..." \
  SUPABASE_ANON_KEY="..." \
  ANTHROPIC_API_KEY="..." \
  DEEPGRAM_API_KEY="..." \
  ELEVENLABS_API_KEY="..."
```

Then the optional ones:

```bash
fly secrets set SENTRY_DSN="..."      # crash reporting; inert if unset
fly secrets set APPLE_BUNDLE_ID="com.yoshinishikawahara.gymsync"
```

**Do not set `REDIS_URL`.** The server deliberately refuses to boot with it,
because `RedisCache` in `app/cache.py` is still a stub and setting it would
imply rate limits are shared across processes when they are not.

**Do not set `APPLE_ALLOW_LOCAL_TESTING`, and leave `APPLE_ENVIRONMENTS` alone
until the App Store record exists.** `APP_ENV=production` is already set in
`fly.toml`, and `validate_billing_settings()` refuses to start a production
process that would accept locally-signed Xcode transactions. That refusal is
the feature — it's what stops free Premium.

Verify (this prints names only, never values):

```bash
fly secrets list
```

---

## 3. Deploy

```bash
fly deploy
```

The first build takes several minutes: it installs onnxruntime and downloads
both RAG models into the image. Later builds reuse that layer unless
`requirements.txt` changes.

**This is the first time the Dockerfile has ever been built.** If it fails, the
build log says where. The two likeliest spots are the `pip install` layer and
the model-warming layer.

Then check it:

```bash
fly status                       # one machine, state "started"
fly logs                         # look for the uvicorn startup line
curl https://<your-app>.fly.dev/health
# expect: {"status":"ok"}
```

`/health` returning ok proves the process is up. It does **not** prove Supabase
is reachable — the health check is deliberately dependency-free so a brief
Supabase blip can't trigger a restart loop. To check the database path, sign in
from the app.

---

## 4. Point the app at it

```bash
# .env  (local dev)
EXPO_PUBLIC_API_URL=https://<your-app>.fly.dev
```

And as an EAS secret, for real builds:

```bash
eas secret:create --name EXPO_PUBLIC_API_URL --value https://<your-app>.fly.dev
```

It must be **https**. `src/voice/config.ts` derives the WebSocket URL by
swapping the scheme, so `https` gives `wss` and an `http` base would send voice
audio unencrypted. A release build with this unset now throws at launch rather
than silently pointing at localhost.

Rebuild the dev client so it picks the value up:

```bash
npx expo run:ios
```

---

## 5. Verify end to end, on a device

Simulator is not enough for the parts that matter. On a real phone:

- [ ] Sign up with email; confirm a `profiles` row appears in Supabase
- [ ] Sign in with Apple — needs the entitlement from `expo prebuild`
- [ ] Sign in with Google
- [ ] Generate a plan (hits Anthropic through the deployed backend)
- [ ] **Start a voice session** — this is the one that proves `wss` works
      through Fly's proxy, and the one most likely to fail first
- [ ] Log a set, reopen the app, confirm it persisted
- [ ] Ask the coach a knowledge question — proves the baked RAG models loaded
      without a runtime download (watch `fly logs` for a HuggingFace fetch; you
      should see none)

---

## Rolling back

Under a minute, and worth rehearsing **before** you need it.

```bash
fly releases                     # list, newest first
fly releases rollback            # previous release
fly releases rollback v37        # or a specific one
```

Images are immutable and retained, so a rollback re-runs a known-good image
rather than rebuilding.

**What rollback does not undo:**

- **Database migrations.** Supabase migrations are applied by hand and have no
  down scripts. A rolled-back app talking to a migrated database is only safe
  while migrations stay additive. Before applying anything destructive
  (dropping or renaming a column), ship the code that tolerates both shapes
  first, and only then change the schema.
- **Secrets.** `fly secrets set` restarts the app on the new value; rolling the
  release back does not roll the secret back. Re-set it explicitly.

If the app is down and the cause isn't obvious, roll back first and diagnose
after. `fly logs` keeps the evidence.

---

## Before submitting to App Review

Deployment unblocks submission but doesn't complete it. Still outstanding:

- **App Store Connect record** — Paid Apps Agreement, banking and tax, the app
  record itself, the `GymSync Membership` subscription group, all four products
  with a 7-day intro offer, and sandbox testers. See `IAP_MANUAL_STEPS.md`.
- **`APPLE_APP_ID`** — the numeric ID, which only exists once the record does.
  Apple's verifier cannot build a Production verifier without it, which is what
  correctly keeps Production unreachable until then.
- **Custom SMTP** — Supabase's built-in mailer is capped at a few messages an
  hour. Signup confirmation and password reset both depend on it. See
  `AUTH_SETUP.md`.
- **A live privacy-policy URL** — `gymsyncapp.me/privacy-policy`, served from
  the `gymsync-web` repo. App Store Connect requires a reachable URL.
- **Supabase Auth console config** — the redirect URLs and provider settings in
  `AUTH_SETUP.md` sections 3 and 4.

---

## Why it costs that

`fly.toml` asks for 1 GB and keeps one machine always running. Both are
deliberate:

- **1 GB, not 256 MB** — onnxruntime holds the embedding and reranker models in
  memory once a premium search warms them. 256 MB is OOM-killed on the first
  one.
- **Always on** — `auto_stop_machines = false`. A machine that stops under an
  idle WebSocket drops a live voice session mid-sentence, and scale-to-zero puts
  a cold start in front of the first request, which is a bad look during App
  Review.
- **One machine** — rate limiting counts in process memory (`app/ratelimit.py`),
  so a second machine doubles every limit. Implement `RedisCache` before scaling
  out; the server enforces this by refusing to start with `REDIS_URL` set.

To go cheaper you'd move RAG serving out of the API process, which frees it to
run at 256–512 MB. That's a real change, not a config tweak.

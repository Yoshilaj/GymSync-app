-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 013_billing.sql — Apple In-App Purchase records and metered usage.       ║
-- ║                                                                          ║
-- ║ 1. apple_transactions: every verified Apple transaction, as append-only  ║
-- ║    audit history. The entitlement is DERIVED from these rows (see        ║
-- ║    app/billing/entitlement.py) and never stored as a flag — a cached     ║
-- ║    "is_premium" boolean is exactly the thing that goes stale after a     ║
-- ║    refund and keeps serving paid features for free.                      ║
-- ║ 2. apple_subscription_owners: which GymSync account owns an Apple        ║
-- ║    subscription. Authoritative for ownership; see the note below.        ║
-- ║ 3. feature_usage + increment_feature_usage(): metered quotas.            ║
-- ║                                                                          ║
-- ║ Only the service-role backend writes any of this. RLS grants SELECT on   ║
-- ║ your own rows and nothing more — a client that could INSERT here could   ║
-- ║ grant itself Premium.                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Verified Apple transactions ───────────────────────────────────────────
--
-- PK is (environment, transaction_id), NOT transaction_id alone. Apple's IDs
-- are globally unique in Production, but Sandbox and Xcode generate small
-- local integers — '0', '1', '2' — that collide across users AND across
-- environments. A bare PK means the second sandbox tester on the same machine
-- collides with the first, which reads as a mystery 409 rather than the schema
-- bug it is.
--
-- Every Apple enum is stored as its RAW value. The App Store Server Library
-- leaves a typed field NULL and populates rawX whenever it meets a value it
-- doesn't know, so branching on the typed enum silently misreads anything
-- Apple adds after this migration was written.
CREATE TABLE IF NOT EXISTS apple_transactions (
  environment              TEXT NOT NULL
                           CHECK (environment IN ('Production','Sandbox','Xcode','LocalTesting')),
  transaction_id           TEXT NOT NULL,
  original_transaction_id  TEXT NOT NULL,
  user_id                  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,

  -- Present only when the purchase began inside the app. Absent for
  -- App-Store-initiated resubscribes, promo-code redemptions and Family
  -- Sharing — which is why it cannot be the ownership check on its own.
  app_account_token        UUID,

  product_id               TEXT NOT NULL,
  tier                     TEXT NOT NULL CHECK (tier IN ('pro','premium')),
  period                   TEXT NOT NULL CHECK (period IN ('monthly','yearly')),

  purchased_at             TIMESTAMPTZ NOT NULL,
  expires_at               TIMESTAMPTZ,
  revoked_at               TIMESTAMPTZ,

  raw_type                 TEXT,   -- "Auto-Renewable Subscription", ...
  raw_ownership_type       TEXT,   -- "PURCHASED" | "FAMILY_SHARED"
  raw_revocation_reason    INT,
  raw_offer_type           INT,    -- 1 introductory, 2 promotional, 3 code, 4 win-back
  raw_offer_discount_type  TEXT,   -- "FREE_TRIAL" | "PAY_AS_YOU_GO" | "PAY_UP_FRONT" | ...

  -- Apple sets this on the row a plan change SUPERSEDED. Excluding these is
  -- what makes an upgrade resolve correctly without waiting for Apple to
  -- rewrite the old row's expiry.
  is_upgraded              BOOLEAN NOT NULL DEFAULT FALSE,

  -- When Apple signed this payload. Drives the monotonic upsert: a replay
  -- carrying older state must never overwrite newer state. Nullable in the
  -- payload, so readers COALESCE it with purchased_at.
  signed_date              TIMESTAMPTZ,

  -- The full decoded payload. The cheapest insurance available: when a
  -- question arises that these columns can't answer, the answer is still here.
  raw                      JSONB NOT NULL,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (environment, transaction_id)
);

-- The entitlement read: one user's candidate rows, newest expiry first.
CREATE INDEX IF NOT EXISTS apple_transactions_user_expiry_idx
  ON apple_transactions (user_id, expires_at DESC);

-- The ownership read, and the "all rows for this subscription" read.
CREATE INDEX IF NOT EXISTS apple_transactions_original_idx
  ON apple_transactions (environment, original_transaction_id);

-- ── 2. Subscription ownership ────────────────────────────────────────────────
--
-- One Apple subscription belongs to exactly one GymSync account. This table is
-- AUTHORITATIVE: apple_transactions.user_id is resolved through it on every
-- write rather than taken from whoever happened to POST, so the two cannot
-- drift apart.
--
-- Why it exists: requiring app_account_token to match the caller (the obvious
-- design) rejects every transaction Apple originates outside the app, where
-- that token is absent — real customers who paid and would get nothing.
--
-- bind_reason records how the claim was established:
--   'token'    — app_account_token proved it. The normal path.
--   'inferred' — no token, subscription unclaimed, and the caller had no other
--                active subscription. A deliberate, auditable concession.
CREATE TABLE IF NOT EXISTS apple_subscription_owners (
  environment              TEXT NOT NULL
                           CHECK (environment IN ('Production','Sandbox','Xcode','LocalTesting')),
  original_transaction_id  TEXT NOT NULL,
  user_id                  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  bind_reason              TEXT NOT NULL DEFAULT 'token'
                           CHECK (bind_reason IN ('token','inferred')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (environment, original_transaction_id)
);

CREATE INDEX IF NOT EXISTS apple_subscription_owners_user_idx
  ON apple_subscription_owners (user_id);

-- ── 3. Metered feature usage ─────────────────────────────────────────────────
--
-- period_key is the bucket, formatted by the caller so this table needs no
-- opinion about calendars:
--   'all'         lifetime   (free tier's single plan generation)
--   '2026-07'     monthly    (Pro's voice sessions)
--   '2026-07-30'  daily      (free tier's chat messages)
CREATE TABLE IF NOT EXISTS feature_usage (
  user_id     UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  feature     TEXT NOT NULL,
  period_key  TEXT NOT NULL,
  count       INT  NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, feature, period_key)
);

-- Atomic increment, returning the post-increment count.
--
-- This has to be a function. PostgREST cannot express `count = count + 1`, so
-- the app layer would have to read-then-write — and two voice sessions opened
-- at once would both read 9, both write 10, and both be allowed past a cap of
-- 10. ON CONFLICT DO UPDATE settles it inside a single statement.
--
-- SECURITY DEFINER with a pinned search_path: it is called by the service role
-- today, but a mutable search_path on a definer function is a privilege-
-- escalation vector, so it is nailed down here rather than assumed.
CREATE OR REPLACE FUNCTION increment_feature_usage(
  p_user_id    UUID,
  p_feature    TEXT,
  p_period_key TEXT,
  p_delta      INT DEFAULT 1
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_count INT;
BEGIN
  INSERT INTO feature_usage (user_id, feature, period_key, count, updated_at)
  VALUES (p_user_id, p_feature, p_period_key, p_delta, now())
  ON CONFLICT (user_id, feature, period_key) DO UPDATE
    SET count = feature_usage.count + EXCLUDED.count,
        updated_at = now()
  RETURNING count INTO new_count;

  RETURN new_count;
END $$;

REVOKE ALL ON FUNCTION increment_feature_usage(UUID, TEXT, TEXT, INT) FROM PUBLIC;

-- ── RLS: read your own, write nothing ────────────────────────────────────────
--
-- SELECT-only on purpose, unlike the FOR ALL owner policies in 004. These
-- tables ARE the entitlement; a client able to write them could mint itself
-- Premium. The service role bypasses RLS and remains the only writer.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'apple_transactions','apple_subscription_owners','feature_usage'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_owner_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING ((select auth.uid()) = user_id);',
      t || '_owner_read', t);
  END LOOP;
END $$;

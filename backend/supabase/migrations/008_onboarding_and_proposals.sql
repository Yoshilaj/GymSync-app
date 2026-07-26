-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 008_onboarding_and_proposals.sql                                         ║
-- ║                                                                          ║
-- ║ 1. Profiles grow the onboarding fields: anthropometrics (canonical       ║
-- ║    metric — `units` stays a display preference) for the nutrition        ║
-- ║    calculator, and training constraints for plan generation.             ║
-- ║    `onboarded_at` is the first-run gate (NULL = not onboarded) and an    ║
-- ║    audit timestamp in one.                                               ║
-- ║ 2. plan_proposals: the agent's plan drafts awaiting user consent.        ║
-- ║    Durable (survives restarts, rehydrates the chat card), and keeps      ║
-- ║    workout_plans meaning "accepted plans only".                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Profiles: onboarding fields ───────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS sex             TEXT    CHECK (sex IN ('male','female')),
  ADD COLUMN IF NOT EXISTS birth_year      INT     CHECK (birth_year BETWEEN 1900 AND 2100),
  ADD COLUMN IF NOT EXISTS height_cm       NUMERIC CHECK (height_cm BETWEEN 90 AND 250),
  ADD COLUMN IF NOT EXISTS weight_kg       NUMERIC CHECK (weight_kg BETWEEN 25 AND 350),
  ADD COLUMN IF NOT EXISTS activity_level  TEXT    CHECK (activity_level IN
                          ('sedentary','light','moderate','very_active','athlete')),
  ADD COLUMN IF NOT EXISTS training_days   INT     CHECK (training_days BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS session_minutes INT     CHECK (session_minutes BETWEEN 15 AND 240),
  ADD COLUMN IF NOT EXISTS equipment       TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarded_at    TIMESTAMPTZ;

-- ── 2. Plan proposals (agent drafts pending user Accept) ─────────────────────
CREATE TABLE IF NOT EXISTS plan_proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  payload          JSONB NOT NULL,           -- normalized proposal (see agents/tools.py)
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','accepted','superseded','rejected')),
  accepted_plan_id UUID REFERENCES workout_plans ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_proposals_user_status_idx
  ON plan_proposals (user_id, status);

-- RLS backstop, same owner pattern as 004 (service role bypasses; the real
-- boundary is the app-layer .eq("user_id", ...) filter).
ALTER TABLE public.plan_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_proposals_owner ON public.plan_proposals;
CREATE POLICY plan_proposals_owner ON public.plan_proposals
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

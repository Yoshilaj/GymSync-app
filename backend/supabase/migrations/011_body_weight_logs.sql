-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 011_body_weight_logs.sql — daily body-weight log (one row per user/day). ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS body_weight_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  day        DATE NOT NULL,
  weight_kg  NUMERIC NOT NULL CHECK (weight_kg BETWEEN 25 AND 350),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, day)
);

ALTER TABLE public.body_weight_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS body_weight_logs_owner ON public.body_weight_logs;
CREATE POLICY body_weight_logs_owner ON public.body_weight_logs
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 004_rls.sql — Row-Level Security as DEFENSE-IN-DEPTH.                    ║
-- ║                                                                          ║
-- ║ The backend uses the service-role key (BYPASSRLS), so the REAL per-user  ║
-- ║ boundary stays the mandatory app-layer `.eq("user_id", user_id)` filter. ║
-- ║ These policies are the backstop: if the anon/authenticated key is ever   ║
-- ║ used directly (or a filter is forgotten), users still only see their own ║
-- ║ rows. Every Supabase `public` table is exposed via PostgREST, so RLS must║
-- ║ be ON for all of them.                                                   ║
-- ║                                                                          ║
-- ║ Perf note: policies use `(select auth.uid())` — the SELECT wrapper makes ║
-- ║ Postgres evaluate it ONCE per query instead of once per row.             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Per-user tables: owner can see/modify only their own rows ────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','workout_plans','workout_sessions','personalities',
    'plan_workouts','plan_exercises','completed_sets','injuries','constraints'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING ((select auth.uid()) = user_id) '
      'WITH CHECK ((select auth.uid()) = user_id);',
      t || '_owner', t);
  END LOOP;
END $$;

-- ── exercises: shared catalog is world-readable; a user's own custom rows are ─
--    visible/editable only to them. (Shared rows are written by service role.)
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exercises_read ON public.exercises;
CREATE POLICY exercises_read ON public.exercises
  FOR SELECT TO authenticated
  USING (created_by IS NULL OR created_by = (select auth.uid()));
DROP POLICY IF EXISTS exercises_write_own ON public.exercises;
CREATE POLICY exercises_write_own ON public.exercises
  FOR ALL TO authenticated
  USING (created_by = (select auth.uid()))
  WITH CHECK (created_by = (select auth.uid()));

-- ── Shared knowledge base: readable by any signed-in user; written by the ────
--    ingest job (service role, bypasses RLS).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['knowledge_parents','knowledge_chunks'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true);',
      t || '_read', t);
  END LOOP;
END $$;

-- ── personal_chunks: re-create the owner policy with the (select ...) form ───
ALTER TABLE public.personal_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_chunks_owner ON public.personal_chunks;
CREATE POLICY personal_chunks_owner ON public.personal_chunks
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── Cover the one foreign key that gets joined/cascaded at volume ─────────────
--    (parent deletes on re-ingest cascade to children; the rest are low-traffic).
CREATE INDEX IF NOT EXISTS knowledge_chunks_parent_idx ON knowledge_chunks (parent_id);

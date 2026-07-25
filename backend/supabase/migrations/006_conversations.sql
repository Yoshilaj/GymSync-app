-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 006_conversations.sql — ChatGPT-style persistent chat for the Sync tab.  ║
-- ║                                                                          ║
-- ║ Normalized tables, NOT a JSONB blob: threads are unbounded, so appending ║
-- ║ must be an INSERT (concurrency-safe, no read-modify-write lost updates — ║
-- ║ the same lesson 002 applied when session_data became completed_sets).    ║
-- ║                                                                          ║
-- ║ Lifecycle: conversations idle for 90 days are purged by a nightly        ║
-- ║ pg_cron sweep; the list endpoint additionally filters on updated_at so   ║
-- ║ expired threads never surface even between sweeps.                       ║
-- ║                                                                          ║
-- ║ ⚠ PREREQUISITE: enable the pg_cron extension first                       ║
-- ║   (Dashboard → Database → Extensions → pg_cron), or the final            ║
-- ║   cron.schedule call fails.                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- List query: a user's conversations, newest activity first.
CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
  ON conversations (user_id, updated_at DESC);
-- Nightly TTL sweep scans by age alone.
CREATE INDEX IF NOT EXISTS conversations_updated_idx
  ON conversations (updated_at);

CREATE TABLE IF NOT EXISTS conversation_messages (
  -- Identity, not uuid: insertion order within a thread is the sort key.
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  -- Denormalized owner (house convention, see 002) so the app-layer
  -- .eq(user_id) filter and the RLS backstop never need a join.
  user_id         UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Thread load and last-N replay both walk (conversation_id, id).
CREATE INDEX IF NOT EXISTS conversation_messages_convo_idx
  ON conversation_messages (conversation_id, id);

-- ── RLS backstop (service role bypasses; real boundary is the app filter) ────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversations', 'conversation_messages'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING ((select auth.uid()) = user_id) '
      'WITH CHECK ((select auth.uid()) = user_id);',
      t || '_owner', t);
  END LOOP;
END $$;

-- ── 90-day retention. cron.schedule upserts by name, so re-running is safe. ──
-- Message rows ride the ON DELETE CASCADE.
SELECT cron.schedule(
  'purge-expired-conversations',
  '17 3 * * *',
  $$DELETE FROM conversations WHERE updated_at < now() - interval '90 days'$$
);

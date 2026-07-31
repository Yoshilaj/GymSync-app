-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 003_rag.sql — pgvector schema for the two RAG pipelines.                 ║
-- ║                                                                          ║
-- ║ Knowledge RAG  : shared corpus of ~200-300 open-access fitness/health    ║
-- ║                  papers. Parent/child chunks + hybrid search             ║
-- ║ Personal RAG   : per-user semantic memory                                ║
-- ║                   - injuries                                             ║
-- ║                   - preferences                                          ║
-- ║                   - session                                              ║
-- ║                   - summaries                                            ║
-- ║                   - plan rationale                                       ║
-- ║                : user_id-leading partition ready                         ║
-- ║                : RLS as defense-in-depth.                                ║
-- ║                                                                          ║
-- ║ Embeddings: nomic-embed-text-v1.5, 768-dim, cosine.                      ║
-- ║           : every row tags embedding_model --> future model swap is      ║
-- ║             detectable (halfvec + Matryoshka)                            ║
-- ║ -512 are deferred memory levers (Q6) — schema stays vector(768) for now. ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector >= 0.7

--Knowledge: parent sections (returned to the LLM)
CREATE TABLE IF NOT EXISTS knowledge_parents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source     TEXT NOT NULL,            -- document id / filename / DOI
  section    TEXT,                     -- detected heading
  content    TEXT NOT NULL,            -- full section text (~2000 tok)
  doc_type   TEXT,                     -- 'study' | 'review' | 'guideline' | ...
  year       INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_parents_source_idx ON knowledge_parents (source);

--Knowledge: child chunks (embedded for precision) 
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id       UUID REFERENCES knowledge_parents ON DELETE CASCADE,
  source          TEXT NOT NULL,
  chunk_index     INT  NOT NULL,
  content         TEXT NOT NULL,
  embedding       VECTOR(768),
  -- generated lexical column = the keyword half of hybrid search (Q5).
  fts             TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  doc_type        TEXT,
  year            INT,
  embedding_model TEXT NOT NULL DEFAULT 'nomic-embed-text-v1.5',
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, chunk_index)         -- idempotent ingest upsert key
);
-- HNSW for vector ANN (cosine; nomic vectors are normalized).
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
-- GIN for the FTS / keyword side of hybrid retrieval.
CREATE INDEX IF NOT EXISTS knowledge_chunks_fts_idx
  ON knowledge_chunks USING gin (fts);
-- Pre-filter metadata.
CREATE INDEX IF NOT EXISTS knowledge_chunks_doctype_idx ON knowledge_chunks (doc_type);
CREATE INDEX IF NOT EXISTS knowledge_chunks_year_idx    ON knowledge_chunks (year);

--Personal
--  - per-user semantic memory (isolation-critical)
--  - Only genuinely semantic data lands here:
--     - injuries
--     - preferences
--     - distilled session summaries
--     - plan rationale
--  - Exact numbers (sets/reps/PRs/volume) stay in SQL tables (completed_sets) !!!NOT embedded!!!
CREATE TABLE IF NOT EXISTS personal_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN
                    ('coaching_note','injury','preference','session_summary','plan_rationale')),
  content         TEXT NOT NULL,
  embedding       VECTOR(768),
  fts             TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  source_id       UUID,                -- optional ref to injuries/sessions row
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  embedding_model TEXT NOT NULL DEFAULT 'nomic-embed-text-v1.5',
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_chunks_embedding_idx
  ON personal_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
-- Every personal query LEADS with user_id (the real isolation boundary) + kind
-- filter + recency tiebreak. This index also makes HASH(user_id) partitioning a
-- drop-in later (1M users × ~100 chunks ≈ 100M vectors).
CREATE INDEX IF NOT EXISTS personal_chunks_user_kind_time_idx
  ON personal_chunks (user_id, kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS personal_chunks_fts_idx
  ON personal_chunks USING gin (fts);

--RLS
--  - DEFENSE-IN-DEPTH only
--  - backend uses the service-role key (BYPASSRLS) over a pooled connection --> the
--    enforced boundary is the mandatory app-layer `.eq("user_id", user_id)` filter
--  - this policy is the backstop for any path that ever runs under an authenticated JWT.
ALTER TABLE personal_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_chunks_owner ON personal_chunks;
CREATE POLICY personal_chunks_owner ON personal_chunks
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Note: per-path search effort is set at QUERY time, not here:
--   SET LOCAL hnsw.ef_search = 40;   -- voice (speed)
--   SET LOCAL hnsw.ef_search = 100;  -- text / plan (accuracy)

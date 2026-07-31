-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 006_rag_rpc.sql — hybrid-search RPCs consumed by app/rag/search.py.        ║
-- ║                                                                            ║
-- ║ SPEC / NOT-YET-APPLIED: these functions are the DB half of the pipeline.   ║
-- ║ They are exercisable once the corpus is embedded (real Embedder) — until   ║
-- ║ then app/rag callers swallow the "function does not exist" error and       ║
-- ║ degrade to no augmentation.                                                ║
-- ║                                                                            ║
-- ║ Split by modality (vector vs lexical) on purpose: RRF fusion happens in    ║
-- ║ the app layer (app/rag/fusion.py), so each function returns ONE ranked     ║
-- ║ list. The functions own what must be server-side: per-path ef_search, the  ║
-- ║ cosine operator, ts_rank, and the leading user_id filter for personal.     ║
-- ║                                                                            ║
-- ║ Vectors are passed from Python as a JSON array and cast to vector(768).    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Knowledge: vector side ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_knowledge_vector(
  query_embedding   vector(768),
  match_count       int  DEFAULT 20,
  filter_doc_type   text DEFAULT NULL,
  filter_year_min   int  DEFAULT NULL,
  ef                int  DEFAULT 100
)
RETURNS TABLE (
  id uuid, parent_id uuid, source text, content text,
  chunk_index int, doc_type text, year int, distance float
)
LANGUAGE plpgsql AS $$
BEGIN
  -- Per-query HNSW search effort (voice=40 speed / text=100 accuracy).
  PERFORM set_config('hnsw.ef_search', ef::text, true);
  RETURN QUERY
    SELECT k.id, k.parent_id, k.source, k.content, k.chunk_index, k.doc_type, k.year,
           (k.embedding <=> query_embedding) AS distance
    FROM knowledge_chunks k
    WHERE (filter_doc_type IS NULL OR k.doc_type = filter_doc_type)
      AND (filter_year_min IS NULL OR k.year >= filter_year_min)
    ORDER BY k.embedding <=> query_embedding      -- cosine distance, ascending
    LIMIT match_count;
END;
$$;

-- ── Knowledge: lexical side ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_knowledge_lexical(
  query_text        text,
  match_count       int  DEFAULT 20,
  filter_doc_type   text DEFAULT NULL,
  filter_year_min   int  DEFAULT NULL
)
RETURNS TABLE (
  id uuid, parent_id uuid, source text, content text,
  chunk_index int, doc_type text, year int, rank float
)
LANGUAGE sql AS $$
  SELECT k.id, k.parent_id, k.source, k.content, k.chunk_index, k.doc_type, k.year,
         ts_rank(k.fts, websearch_to_tsquery('english', query_text)) AS rank
  FROM knowledge_chunks k
  WHERE k.fts @@ websearch_to_tsquery('english', query_text)
    AND (filter_doc_type IS NULL OR k.doc_type = filter_doc_type)
    AND (filter_year_min IS NULL OR k.year >= filter_year_min)
  ORDER BY rank DESC
  LIMIT match_count;
$$;

-- ── Personal: vector side (user_id LEADS — isolation boundary) ─────────────────
CREATE OR REPLACE FUNCTION match_personal_vector(
  p_user_id         uuid,
  query_embedding   vector(768),
  match_count       int    DEFAULT 12,
  filter_kinds      text[] DEFAULT NULL,
  ef                int    DEFAULT 40
)
RETURNS TABLE (
  id uuid, kind text, source text, content text, occurred_at timestamptz, distance float
)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('hnsw.ef_search', ef::text, true);
  RETURN QUERY
    SELECT p.id, p.kind, NULL::text AS source, p.content, p.occurred_at,
           (p.embedding <=> query_embedding) AS distance
    FROM personal_chunks p
    WHERE p.user_id = p_user_id                    -- MANDATORY app-layer isolation filter
      AND (filter_kinds IS NULL OR p.kind = ANY(filter_kinds))
    ORDER BY p.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ── Personal: lexical side ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_personal_lexical(
  p_user_id         uuid,
  query_text        text,
  match_count       int    DEFAULT 12,
  filter_kinds      text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid, kind text, source text, content text, occurred_at timestamptz, rank float
)
LANGUAGE sql AS $$
  SELECT p.id, p.kind, NULL::text AS source, p.content, p.occurred_at,
         ts_rank(p.fts, websearch_to_tsquery('english', query_text)) AS rank
  FROM personal_chunks p
  WHERE p.user_id = p_user_id                      -- isolation boundary
    AND p.fts @@ websearch_to_tsquery('english', query_text)
    AND (filter_kinds IS NULL OR p.kind = ANY(filter_kinds))
  ORDER BY rank DESC
  LIMIT match_count;
$$;

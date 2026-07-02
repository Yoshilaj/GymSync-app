# Knowledge Ingestion Pipeline — Plan

The retrieval pipeline (`backend/app/rag/`) and the DB schema (`003_rag.sql`) are in place,
and the real embedder (`NomicEmbedder`, nomic-embed-text-v1.5, 768-d) now works. What's
missing is the **corpus**: `knowledge_parents` / `knowledge_chunks` are empty, so
`search_knowledge` returns nothing even once `006` is applied.

This document plans the **offline ingestion subsystem** that fills them. It is *not* part of
the request path — it's a standalone script/CLI run occasionally (on corpus updates), so it
optimizes for correctness, idempotency, and resumability over latency.

---

## 1. Goal & shape

```
sources ─▶ [fetch] ─▶ raw/ ─▶ [parse] ─▶ [section→parents] ─▶ [chunk→children]
       ─▶ [embed children (search_document:)] ─▶ [idempotent upsert] ─▶ Supabase
```

- **Target corpus:** ~200-300 open-access fitness/health documents (per `003_rag.sql`).
- **Entry point:** `python -m app.ingest` (a CLI under `backend/app/ingest/`), with
  subcommands `fetch`, `parse`, `embed`, `load`, and an `all` that runs the chain.
- **Reuses:** `NomicEmbedder.embed_documents()` (already applies the `search_document:`
  prefix) and `settings` for DB creds. No new embedding code.

---

## 2. Corpus sourcing (the hardest, least-code part)

Licensing is the gate: we only ingest content we can legally store and excerpt. Candidates:

| Source | What | License | Access |
|---|---|---|---|
| **PubMed Central OA subset** | peer-reviewed exercise/nutrition papers | CC-BY / CC0 (OA subset only) | bulk API + FTP; filter by MeSH terms |
| **ISSN / ACSM position stands** | authoritative consensus statements | varies — check each | many are open PDFs |
| **NSCA / open guidelines** | programming, technique | varies | case-by-case |
| **Wikipedia (exercise science)** | broad baseline coverage | CC-BY-SA | REST dump |

**Decision needed before building:** confirm the source mix. Recommended v1: **PMC OA subset
only** — it's cleanly licensed, bulk-fetchable, and uniform (JATS XML, which parses far more
reliably than arbitrary PDFs). Add curated position stands manually in v2.

- Keep a `sources.jsonl` manifest (one row per doc: `source_id`, `url`, `title`, `doc_type`,
  `year`, `license`) checked into the repo so the corpus is reproducible and auditable.
- Store fetched raw files under `backend/data/raw/` (gitignored) keyed by `source_id`.

---

## 3. Parse → sections → parents

- **PMC JATS XML** (preferred): sections are explicit (`<sec>`, `<title>`) → clean parent
  boundaries with real headings. Use `lxml`.
- **PDF fallback** (position stands): `pymupdf` for text; scientific PDFs are messy
  (columns, headers/footers, references, tables). If PDF quality is poor, consider GROBID
  (a service) — but that's a v2 escalation, not v1.
- **Parent = one section** (~2000 tokens per `003_rag.sql`). Drop reference lists, figure/
  table blobs, and boilerplate (author affiliations, funding).
- Each parent row: `source`, `section`, `content`, `doc_type`, `year`.

---

## 4. Chunk → children

- **Child chunks** are what get embedded (precision), **parents** are what the LLM sees
  (context) — the pipeline's `expand_to_parents` maps child→parent at query time.
- Chunking: ~**512-token children with ~15% overlap**, split on sentence/paragraph
  boundaries (not mid-sentence). Tune after a retrieval spot-check.
- Each child: `parent_id`, `source`, `chunk_index` (0-based within source),
  `content`, `doc_type`, `year`. `fts` is a generated column (no work). `embedding` filled
  next step.
- `chunk_index` must be **stable across re-ingests** — it's half of the
  `UNIQUE (source, chunk_index)` upsert key.

---

## 5. Embed children

- Batch children through `NomicEmbedder.embed_documents(texts)` (fastembed batches
  internally; feed a few hundred at a time to cap memory).
- Tag every row `embedding_model = "nomic-embed-text-v1.5"` (matches schema default) so a
  future model swap is detectable.
- This is CPU-bound and the slow step; make it **resumable** (see §7).

---

## 6. Load → Supabase (idempotent upsert)

- **Order:** upsert parents first (need their `id`s), then children referencing `parent_id`.
- **Idempotency:** children upsert on the `UNIQUE (source, chunk_index)` key, so re-running
  is safe and updates in place. Parents have no natural key — either (a) delete-then-insert
  per `source` inside a transaction, or (b) add a `UNIQUE(source, section)` and upsert.
  Recommend (a) for simplicity: re-ingesting a source fully replaces it (CASCADE cleans its
  children).
- **⚠️ pgvector write wrinkle:** inserting a Python `list[float]` into a `vector(768)` column
  via PostgREST/supabase-py does **not** auto-coerce. Two options:
  1. Format the embedding as a pgvector **string literal** `"[0.1,0.2,...]"` before insert
     (simplest, works over PostgREST), **or**
  2. Add an `insert_knowledge_chunks(rows jsonb)` RPC that casts server-side (mirrors how
     `006` reads vectors as JSON cast to `vector(768)`).
  Recommend **option 1** for v1 — no extra migration. Validate with a round-trip read.
- Batch inserts (e.g. 500 rows) to stay under payload limits.

---

## 7. Idempotency, resumability, versioning

- **Resumable:** persist progress per source (`sources.jsonl` gets a `status` +
  `ingested_at`), so a crashed run skips completed sources. Embeddings can be cached to
  `data/embeddings/<source_id>.npy` so a re-load doesn't re-embed.
- **Corpus versioning:** after a successful full load, bump `settings.knowledge_corpus_version`
  (e.g. `v1`→`v2`). This invalidates the knowledge **retrieval cache** (keys fold in the
  version — see `pipeline.py`), so stale cached passages don't survive a re-ingest.

---

## 8. New dependencies

```
lxml            # JATS XML parsing (PMC)
pymupdf         # PDF fallback text extraction
tiktoken        # token-accurate chunk sizing (optional; can approximate)
```
(fastembed is already added. No torch.)

---

## 9. Verification (how we know it worked)

1. **Counts:** `SELECT count(*) FROM knowledge_parents / knowledge_chunks` match expected.
2. **RPC smoke test:** call `match_knowledge_vector` with a real query embedding → non-empty,
   sensibly ranked.
3. **End-to-end:** flip `settings.embedder=nomic`, hit `search_knowledge` with a fitness
   question → cited passages come back and read as relevant.
4. **Prefix sanity:** already validated — query vs passage embeddings differ; relevant >
   unrelated cosine.

---

## 10. Deployment note (serving side)

The production container must run `NomicEmbedder` to embed queries. fastembed downloads the
model (~0.5GB) on first use. **Bake it into the image** (a build step that pre-fetches the
model) or mount a cache volume — otherwise the first query after each deploy eats a ~60s
cold download. The quantized `nomic-ai/nomic-embed-text-v1.5-Q` (0.13GB) is the lighter
option if image size matters.

---

## 11. Milestones (suggested build order)

1. **M1 — Skeleton + one doc.** CLI scaffold, ingest a *single* hand-placed PMC XML
   end-to-end (parse→chunk→embed→load), prove the pgvector write path + a retrieval round-trip.
2. **M2 — Fetch + manifest.** PMC OA query → `sources.jsonl` → bulk fetch into `data/raw/`.
3. **M3 — Batch + resumable.** Run the full ~200-300 corpus; resumability, embedding cache,
   batched upserts.
4. **M4 — Tune + verify.** Chunk-size/overlap tuning via retrieval spot-checks; bump
   `knowledge_corpus_version`; document the run.

M1 is the risk-retirement step (proves the write path and the round-trip). Everything after
is scaling and polish.

---

## 12. Open questions (decide before M1)

- **Source mix:** PMC-only for v1? (recommended) Or include position-stand PDFs now?
- **Corpus size for v1:** a 20-30 doc pilot first, or straight to ~250?
- **pgvector writes:** string-literal (option 1) vs insert RPC (option 2)? (recommend 1)
- **Where does ingestion run:** local Mac only (offline, results pushed to Supabase), or
  ever in CI? (v1: local only.)
```

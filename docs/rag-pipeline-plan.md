# RAG Pipeline & Production Wrapper

The GymSync backend has a working two-tier streaming agent (`backend/app/agents/core.py`)
reached over SSE chat, a voice WebSocket, and text-over-WebSocket. This document describes
the two layers built on top of it on the `rag-pipeline` branch:

1. A **staged RAG retrieval pipeline** (`backend/app/rag/`) — hybrid search over the two
   corpora defined in `003_rag.sql`, behind protocols so the embedding model, reranker, and
   ingestion stay stubbed for now.
2. A **production-service wrapper** — security, reliability, caching, observability, rate
   limiting, and packaging — folded into the existing streaming agent. The module split
   piggybacks the FreeCodeCamp `production-api` reference, adapted from its OpenAI /
   request-response shape to our **Anthropic + streaming** reality.

The embedding model, reranker, ingestion, and the `006` RPC migration are **out of scope**
for this pass — the pipeline runs end-to-end against stubs and degrades gracefully until
they land.

---

## 1. The keystone: one agent chokepoint

`_core_agent_events()` (formerly `_agent_events`) is reached by **three** callers:

```
POST /api/chat (SSE) ─┐
voice WebSocket ──────┼─▶ run_agent_turn(…, channel) ─▶ _core_agent_events(…)
WS text branch ───────┘        (the single chokepoint)
```

Every production concern lives in `run_agent_turn`, so none can miss the voice path:

```
run_agent_turn:
  ├─ SecurityPipeline.process_input   (blocking, one pass, BEFORE any model call)
  ├─ RequestTimer + TTFT capture
  ├─ _core_agent_events               (personal-RAG prefetch → model loop → tools)
  ├─ swallow internal `usage` events  → token metrics
  ├─ SecurityPipeline.observe_output  (PII/secret scan → logs only, never the stream)
  └─ MetricsCollector.record_request  (latency, ttft, tokens, error)
```

---

## 2. The retrieval pipeline (`backend/app/rag/`)

Both corpora share one staged design; only the entry mechanism and a couple of stages differ.

```
query ─▶ [1] embed query        embedder.py     (StubEmbedder — protocol-gated)
       ─▶ [2] hybrid search      search.py       vector(HNSW) ∥ lexical(FTS) via RPC
       ─▶ [3] fuse               fusion.py       Reciprocal Rank Fusion (k=60)
       ─▶ [4] rerank             rerank.py       IdentityReranker — protocol-gated
       ─▶ [5] expand parents     expand.py       child→parent  (KNOWLEDGE only)
       ─▶ [6] pack               packing.py      token-budget assembly + citations
       ─▶ RetrievalResult { context, citations, chunks, trace }
```

| stage | file | notes |
|---|---|---|
| models | `models.py` | `Chunk`, `Citation`, `RetrievalResult`, `RetrievalParams` (`for_voice()` ef=40/tight budget; `for_text()` ef=100) |
| protocols | `protocols.py` | `Embedder`, `Reranker` — the swap boundaries |
| pipeline | `pipeline.py` | knowledge corpus; `search()` is the `search_knowledge` tool entry; **retrieval cache lives here** |
| personal | `personal.py` | per-user prefetch; atomic (no expand), no rerank, **never cached** |

### Two entry mechanisms (hybrid)

- **Personal memory → pre-fetched.** Small, per-user, always relevant. `personal.prefetch`
  runs each turn and prepends a `<personal_memory>…</personal_memory>` block, exactly like
  the existing `<session_state>` injection in `core.py`. Best-effort: returns `""` on any
  failure so a missing RAG backend never breaks a turn.
- **Knowledge → a tool.** Large shared corpus, query-specific. Exposed as the
  `search_knowledge` tool (steered to the reasoning tier), so it only runs when the model
  decides a substantive question needs evidence.

---

## 3. Production concerns — where each one lives

| concern | module | mechanism |
|---|---|---|
| Input sanitization / prompt-injection | `security.py` | regex heuristics (cheap — no LLM); text blocks on a hard hit, voice never blocks |
| PII detect + mask | `security.py` | detect on input; mask **only in the log/trace sink**, never the live stream |
| Rate limiting | `ratelimit.py` | slowapi keyed by user (JWT) on HTTP; hand-rolled `ws_rate_check` for WS/voice |
| Pydantic validation | `models.py` | `ChatRequest` length bounds |
| Model fallback + retry | `resilience.py` | SDK owns transient establishment retries; `stream_with_resilience` adds a same-tier fallback model, **pre-first-token only** |
| Health / graceful errors | `routers/ops.py`, `core.py` | deep `/health`; loop errors log full detail, return a generic client message (no stack traces) |
| Response caching (TTL) | `cache.py` + `pipeline.py` | caches the **knowledge retrieval layer**, not generations; SHA256 keys, corpus-version invalidation |
| Structured logging + metrics | `monitoring.py` | JSON logs; `MetricsCollector` (latency/TTFT/tokens/errors/cache) → `/metrics` |
| Tracing | `monitoring.py` | LangSmith `@traced` on `run_agent_turn`, `execute_tool`, RAG stages — no-op without a key |
| Deployment | `Dockerfile`, `docker-compose.yml` | non-root user + HEALTHCHECK; api service (+ commented Redis) |

### Decisions worth remembering

- **Streaming ≠ request/response.** The reference validates a whole response string; we
  can't buffer a stream before the first token (voice targets ~1s TTFT). So output security
  is **observe-only**: tee the deltas through untouched, scan the full buffer at `done` into
  logs/metrics. PII in the live path is *not* masked — the coach speaks to its own data
  subject, and masking would force sentence buffering + re-TTS.
- **Cache the retrieval, not the generation.** The corpus is static and queries repeat, so
  query→passages is deterministic and cacheable; personalized streamed generations are not.
  **Personal retrieval is never cached** — a mis-scoped key would leak one user's memory to
  another, and it's already cheap and `user_id`-partitioned.
- **Fallback vs escalation don't fight.** Escalation (Haiku→Sonnet) owns the *requested*
  model; `stream_with_resilience` only walks a fallback list and **never writes back** to the
  loop's `model`. Retry/fallback happens only before the first delta — a mid-stream failure
  re-raises rather than double-emitting.
- **Redis is deferred, on purpose.** In-memory cache + in-process slowapi are correct for a
  single worker. The real forcing function for Redis is *globally-correct rate limiting*
  across workers, not the cache (the knowledge cache over a static corpus is fine to
  duplicate per worker). Flip `settings.redis_url` and finish `RedisCache` when scaling out.

---

## 4. Integration points (the contract to match)

- `core.py`: `_get_client` passes `max_retries`/`timeout`; the stream call goes through
  `stream_with_resilience`; `_core_agent_events` yields internal `usage` events; personal
  prefetch is prepended at message assembly.
- `tools.py`: `search_knowledge` added to `TOOL_DEFINITIONS`; `execute_tool` dispatches it to
  `rag.pipeline.search` and is wrapped with `@traced`.
- `chat.py`: `@limiter.limit` + `request: Request`; body is `models.ChatRequest`.
- `voice.py` / `voice_ws.py`: repointed to `run_agent_turn`; `ws_rate_check` guards each turn.
- `main.py`: lifespan builds the cache singleton next to `init_db`; registers the slowapi
  limiter/handler, `AccessLogMiddleware`, and the `ops` router.

---

## 5. Running & verifying

```bash
cd backend
pip install -r requirements.txt         # adds slowapi, langsmith, tenacity-free resilience, redis (dormant)
pytest                                   # security / cache / fusion / packing / resilience
uvicorn app.main:app --reload            # needs .env with the Supabase/Anthropic/etc. secrets
```

- **Probes:** `curl :8000/health` (db + anthropic + cache), `/metrics`, `/cache-stats`.
- **Rate limit:** hammer `/api/chat` past `settings.rate_limit` → graceful `429`.
- **Streaming intact:** an SSE `curl` to `/api/chat` streams deltas unmodified; `backend/test_ws.py`
  still drives the voice socket.
- **RAG stubs:** `search_knowledge` and personal prefetch return well-formed results against
  `StubEmbedder`; the `match_*` RPCs (spec in `006_rag_rpc.sql`) fail loudly and are swallowed
  until embeddings + the migration land.
- **Container:** `docker compose up --build` → healthcheck turns green; `whoami` in the
  container is `appuser`, not root.

---

## 6. What's next (out of scope here)

Real embedding model (nomic-embed-text-v1.5, 768-d) + a cross-encoder reranker, document
ingestion into `knowledge_*`, applying `006_rag_rpc.sql`, and — when scaling past one worker
— wiring `RedisCache` and a shared slowapi store.

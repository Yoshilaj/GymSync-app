"""
Offline knowledge-ingestion subsystem — see docs/ingestion-plan.md.

Fills knowledge_parents / knowledge_chunks from source documents. This is NOT part of
the request path: it's a standalone CLI (`python -m app.ingest`) run occasionally on
corpus updates, so it optimizes for correctness, idempotency, and resumability over
latency.

Module layout mirrors the pipeline stages:
    parse   — JATS XML  → Section list                (pure; no app/db imports)
    chunk   — Sections  → Parent + ChildChunk list    (pure; no app/db imports)
    load    — embed children + idempotent upsert to Supabase   (needs env/creds)
    __main__— the CLI that wires the stages together

Keeping parse/chunk pure means they run and test without env vars or a DB — the credentials
are only touched at the load step.
"""

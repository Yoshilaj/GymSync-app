"""
RAG retrieval pipeline.

Two corpora, one staged design (embed → hybrid search → RRF → rerank → expand → pack):
  • pipeline.search   — knowledge corpus, model-invoked via the `search_knowledge` tool.
  • personal.prefetch — per-user memory, pre-injected into every turn.

Embeddings, the reranker, and ingestion are stubbed behind protocols (protocols.py); the
DB-facing hybrid search expects the RPCs in migrations/006_rag_rpc.sql.
"""

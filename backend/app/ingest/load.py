"""
Embed child chunks and upsert a document into Supabase — the credentialed stage.

Two things here are load-bearing:

1. pgvector write path (plan §6). Inserting a Python list[float] into a vector(768) column
   through PostgREST/supabase-py does NOT auto-coerce. We format each embedding as a pgvector
   string literal "[0.1,0.2,...]" before insert; pgvector parses that text form into a vector
   on the way in. (The alternative — a server-side insert RPC — is deferred to v2.)

2. Idempotency (plan §6, option a). A source is REPLACED wholesale: delete its parents first
   (ON DELETE CASCADE removes their children), then insert fresh parents and children. This
   keeps chunk_index stable-by-construction and makes re-ingesting a source safe and total,
   with no orphans.

Reuses app.rag.embedder.get_embedder() (settings-selected: stub | nomic) — no embedding code
lives here — and app.database for the AsyncClient.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from supabase import AsyncClient, acreate_client

from app.config import settings
from app.ingest.chunk import ChunkedDoc, chunk_doc
from app.ingest.parse import parse_file
from app.rag.embedder import get_embedder

_EMBED_BATCH = 256  # cap peak memory; fastembed also batches internally


@dataclass
class LoadReport:
    source: str
    parents: int
    children: int
    embedding_model: str


def to_pgvector(vec: list[float]) -> str:
    """pgvector text literal — the format PostgREST needs to insert into a vector column."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


async def _connect() -> AsyncClient:
    return await acreate_client(settings.supabase_url, settings.supabase_service_role_key)


async def _embed_all(texts: list[str]) -> list[list[float]]:
    embedder = get_embedder()
    out: list[list[float]] = []
    for i in range(0, len(texts), _EMBED_BATCH):
        out.extend(await embedder.embed_documents(texts[i:i + _EMBED_BATCH]))
    return out


async def load_doc(doc: ChunkedDoc, *, db: AsyncClient | None = None) -> LoadReport:
    """Idempotently replace `doc.source` in knowledge_parents/knowledge_chunks."""
    db = db or await _connect()
    embedder = get_embedder()

    # 1. Wipe the prior version of this source (CASCADE drops its children too).
    await db.table("knowledge_parents").delete().eq("source", doc.source).execute()

    # 2. Insert parents, capturing their generated ids in list order.
    parent_rows = [
        {
            "source": doc.source,
            "section": p.section or None,
            "content": p.content,
            "doc_type": p.doc_type,
            "year": p.year,
        }
        for p in doc.parents
    ]
    parent_ids: list[str] = []
    if parent_rows:
        res = await db.table("knowledge_parents").insert(parent_rows).execute()
        # PostgREST returns inserted rows in insertion order.
        parent_ids = [str(r["id"]) for r in (res.data or [])]
        if len(parent_ids) != len(parent_rows):
            raise RuntimeError(
                f"expected {len(parent_rows)} parent ids, got {len(parent_ids)}"
            )

    # 3. Embed children, then insert with the resolved parent_id + vector literal.
    child_texts = [c.content for c in doc.children]
    embeddings = await _embed_all(child_texts)
    child_rows = [
        {
            "parent_id": parent_ids[c.parent_index],
            "source": doc.source,
            "chunk_index": c.chunk_index,
            "content": c.content,
            "embedding": to_pgvector(emb),
            "doc_type": c.doc_type,
            "year": c.year,
            "embedding_model": embedder.model_name,
        }
        for c, emb in zip(doc.children, embeddings)
    ]
    if child_rows:
        await db.table("knowledge_chunks").insert(child_rows).execute()

    return LoadReport(
        source=doc.source,
        parents=len(parent_rows),
        children=len(child_rows),
        embedding_model=embedder.model_name,
    )


async def load_manifest(manifest_path: str, raw_dir: str, *, log=print) -> list[LoadReport]:
    """Batch-load every 'relevant', not-yet-loaded doc in the manifest into Supabase.

    Resumable: `loaded_at` is stamped back into the manifest after EACH doc, so a crash
    resumes where it left off. Reuses one AsyncClient across all docs.
    """
    # Imported here to avoid a hard fetch↔load import cycle at module load.
    from app.ingest.fetch import _load_manifest, _write_manifest

    manifest = Path(manifest_path)
    raw = Path(raw_dir)
    rows = _load_manifest(manifest)
    todo = [r for r in rows.values() if r.get("status") == "relevant" and not r.get("loaded_at")]
    log(f"{len(todo)} relevant doc(s) to load (of {len(rows)} in manifest)")
    if not todo:
        return []

    db = await _connect()
    reports: list[LoadReport] = []
    for r in todo:
        xml = raw / f"{r['source_id']}.xml"
        if not xml.exists():
            log(f"  ! {r['source_id']}: raw XML missing, skipping")
            continue
        doc = chunk_doc(parse_file(str(xml), source=r["source_id"]))
        report = await load_doc(doc, db=db)
        r["loaded_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        rows[r["source_id"]] = r
        _write_manifest(manifest, rows)   # persist after each → crash-safe resume
        reports.append(report)
        log(f"  ✓ {report.source}: {report.parents} parents, {report.children} children")
    log(f"loaded {len(reports)} doc(s)")
    return reports

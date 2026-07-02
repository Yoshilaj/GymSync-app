"""
Ingestion CLI:  python -m app.ingest <command>

  fetch  --query Q [--limit N]       Search PMC OA → download JATS to data/raw/ → manifest.
  parse  <file> [--source ID]        Parse JATS → print section/chunk summary. No DB, no env.
  load   <file> [--source ID]        parse → chunk → embed → upsert into Supabase.
  verify <query> [--voice]           Round-trip: embed the query, hit the knowledge RPCs,
                                     print the top hits. Proves retrieval end-to-end.

`fetch` and `parse` are pure (safe to run anywhere). `load` and `verify` need Supabase creds
+ the embedder, so they touch app.config / app.database.
"""
import argparse
import asyncio
import sys

_DEFAULT_RAW = "data/raw"
_DEFAULT_MANIFEST = "data/sources.jsonl"


def _cmd_fetch(args) -> int:
    from app.ingest.fetch import run_fetch

    rows = run_fetch(
        args.query, args.limit,
        raw_dir=args.raw_dir, manifest_path=args.manifest, force=args.force,
    )
    print(f"fetched {len(rows)} new doc(s)")
    return 0


def _cmd_parse(args) -> int:
    # Pure path — import lazily so a missing app env never blocks `parse`.
    from app.ingest.chunk import chunk_doc
    from app.ingest.parse import parse_file

    doc = parse_file(args.file, source=args.source)
    chunked = chunk_doc(doc)
    print(f"source   : {doc.source}")
    print(f"title    : {doc.title}")
    print(f"doc_type : {doc.doc_type}   year: {doc.year}")
    print(f"parents  : {len(chunked.parents)}   children: {len(chunked.children)}")
    for i, p in enumerate(chunked.parents):
        n_children = sum(1 for c in chunked.children if c.parent_index == i)
        head = (p.content[:70] + "…") if len(p.content) > 70 else p.content
        print(f"  [{i}] {p.section or '(lead)':<28} {n_children:>2} chunks | {head}")
    return 0


async def _cmd_load(args) -> int:
    from app.ingest.chunk import chunk_doc
    from app.ingest.load import load_doc
    from app.ingest.parse import parse_file

    doc = parse_file(args.file, source=args.source)
    chunked = chunk_doc(doc)
    report = await load_doc(chunked)
    print(f"loaded '{report.source}': {report.parents} parents, "
          f"{report.children} children (model={report.embedding_model})")
    return 0


async def _cmd_verify(args) -> int:
    from app.rag.embedder import get_embedder
    from app.rag.models import RetrievalParams
    from app.rag.search import hybrid_search
    from supabase import acreate_client
    from app.config import settings

    db = await acreate_client(settings.supabase_url, settings.supabase_service_role_key)
    params = RetrievalParams.for_voice() if args.voice else RetrievalParams.for_text()
    embedding = await get_embedder().embed_query(args.query)
    vec, lex = await hybrid_search(
        db, corpus="knowledge", embedding=embedding, query_text=args.query, params=params,
    )
    print(f"query: {args.query!r}   (vector hits: {len(vec)}, lexical hits: {len(lex)})")
    print("— vector —")
    for c in vec[:5]:
        print(f"  {c.source} #{c.metadata.get('chunk_index')}: {c.content[:80]}…")
    print("— lexical —")
    for c in lex[:5]:
        print(f"  {c.source} #{c.metadata.get('chunk_index')}: {c.content[:80]}…")
    if not vec and not lex:
        print("  (no hits — is the corpus loaded? run `load` first)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.ingest")
    sub = parser.add_subparsers(dest="command", required=True)

    p_fetch = sub.add_parser("fetch", help="search PMC OA, download JATS, build the manifest")
    p_fetch.add_argument("--query", required=True, help="PMC search terms")
    p_fetch.add_argument("--limit", type=int, default=15, help="max docs to fetch (default 15)")
    p_fetch.add_argument("--raw-dir", default=_DEFAULT_RAW)
    p_fetch.add_argument("--manifest", default=_DEFAULT_MANIFEST)
    p_fetch.add_argument("--force", action="store_true", help="re-fetch even if already on disk")

    p_parse = sub.add_parser("parse", help="parse JATS and print a summary (no DB)")
    p_parse.add_argument("file")
    p_parse.add_argument("--source", default=None, help="override the source id (default: PMC id)")

    p_load = sub.add_parser("load", help="parse→chunk→embed→upsert a document")
    p_load.add_argument("file")
    p_load.add_argument("--source", default=None)

    p_verify = sub.add_parser("verify", help="round-trip a query against the knowledge RPCs")
    p_verify.add_argument("query")
    p_verify.add_argument("--voice", action="store_true", help="use the voice (speed) params")

    args = parser.parse_args(argv)
    if args.command == "fetch":
        return _cmd_fetch(args)
    if args.command == "parse":
        return _cmd_parse(args)
    if args.command == "load":
        return asyncio.run(_cmd_load(args))
    if args.command == "verify":
        return asyncio.run(_cmd_verify(args))
    return 1


if __name__ == "__main__":
    sys.exit(main())

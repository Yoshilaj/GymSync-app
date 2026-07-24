"""
Fetch PMC Open-Access articles and build the sources manifest (plan §2, curated in M3).

esearch (db=pmc, "open access[filter]", relevance-sorted) → PMCIDs, then efetch → JATS XML
saved under data/raw/ (gitignored). Each fetched doc is parsed, run through the relevance gate
(app/ingest/corpus.is_relevant), and recorded in data/sources.jsonl — a manifest checked into
the repo (source_id, url, title, doc_type, year, license, journal, domain, status, loaded_at)
so the corpus is reproducible and auditable.

`run_corpus_fetch` sweeps the five curated domains (corpus.DOMAINS); `run_fetch` handles a
single ad-hoc query. Pure module (httpx only, no app.config/DB), rate-limited per NCBI
etiquette, idempotent/resumable (a source already on disk is skipped unless force=True).
"""
import json
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import httpx

from app.ingest.corpus import DOMAINS, build_query, is_relevant
from app.ingest.parse import parse_jats

_EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
_OA_FILTER = "open access[filter]"
_TOOL = "gymsync-ingest"
_RELEVANCE_BLOB = 6000   # chars of body prose fed to the relevance gate


@dataclass
class ManifestRow:
    source_id: str
    pmcid: str
    url: str
    title: str
    doc_type: str
    year: int | None
    license: str | None
    journal: str | None
    domain: str | None       # which curated domain surfaced it (None for ad-hoc fetch)
    n_sections: int
    status: str              # 'relevant' | 'rejected' | 'empty'
    loaded_at: str | None    # set by load_manifest once embedded+upserted (resumability)


def _common_params() -> dict:
    p = {"tool": _TOOL}
    if email := os.getenv("NCBI_EMAIL"):
        p["email"] = email
    if key := os.getenv("NCBI_API_KEY"):
        p["api_key"] = key
    return p


def _throttle_seconds() -> float:
    # NCBI allows 10 req/s with a key, 3 without. Stay comfortably under.
    return 0.12 if os.getenv("NCBI_API_KEY") else 0.35


def search_oa(client: httpx.Client, query: str, limit: int, *, sort: str = "relevance") -> list[str]:
    """Return up to `limit` PMCIDs in the OA subset matching `query`. Relevance-sorted by
    default — recency sort (M2) was the main cause of off-topic results."""
    params = {
        **_common_params(),
        "db": "pmc",
        "term": f"({query}) AND {_OA_FILTER}",
        "retmax": limit,
        "retmode": "json",
        "sort": sort,
    }
    r = client.get(f"{_EUTILS}/esearch.fcgi", params=params, timeout=30)
    r.raise_for_status()
    return r.json()["esearchresult"]["idlist"]


def fetch_article_xml(client: httpx.Client, pmcid: str) -> bytes:
    """efetch the full JATS XML for one PMCID (bare numeric id)."""
    params = {**_common_params(), "db": "pmc", "id": pmcid, "retmode": "xml"}
    r = client.get(f"{_EUTILS}/efetch.fcgi", params=params, timeout=60)
    r.raise_for_status()
    return r.content


def _load_manifest(path: Path) -> dict[str, dict]:
    rows: dict[str, dict] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line:
                row = json.loads(line)
                rows[row["source_id"]] = row
    return rows


def _write_manifest(path: Path, rows: dict[str, dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Stable order: by source_id so diffs are readable in git.
    ordered = sorted(rows.values(), key=lambda r: r["source_id"])
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in ordered))


def _process_pmcid(client: httpx.Client, pmcid: str, domain: str | None, raw: Path,
                   existing: dict[str, dict], force: bool, log) -> ManifestRow | None:
    """Download + parse + gate one article, updating `existing`. Returns None if skipped."""
    source_id = f"PMC{pmcid}"
    xml_path = raw / f"{source_id}.xml"
    if not force and source_id in existing and xml_path.exists():
        log(f"  skip {source_id} (already fetched)")
        return None

    xml = fetch_article_xml(client, pmcid)
    xml_path.write_bytes(xml)
    doc = parse_jats(xml, source=source_id)

    blob = " ".join(s.text for s in doc.sections)[:_RELEVANCE_BLOB]
    passed, hits = is_relevant(doc.title, blob, doc.journal) 
    status = "empty" if not doc.sections else ("relevant" if passed else "rejected")

    row = ManifestRow(
        source_id=source_id, pmcid=pmcid,
        url=f"https://www.ncbi.nlm.nih.gov/pmc/articles/{source_id}/",
        title=doc.title, doc_type=doc.doc_type, year=doc.year, license=doc.license,
        journal=doc.journal, domain=domain, n_sections=len(doc.sections),
        status=status, loaded_at=None,
    )
    existing[source_id] = asdict(row)
    mark = {"relevant": "✓", "rejected": "✗", "empty": "∅"}[status]
    log(f"  {mark} {source_id} [{domain or '-'}] {len(doc.sections)}sec | {(doc.title or '')[:52]}")
    time.sleep(_throttle_seconds())
    return row


def run_corpus_fetch(per_domain: int, *, raw_dir: str, manifest_path: str,
                     force: bool = False, log=print) -> list[ManifestRow]:
    """Sweep the five curated domains, fetching up to `per_domain` unique docs each."""
    raw = Path(raw_dir); raw.mkdir(parents=True, exist_ok=True)
    manifest = Path(manifest_path)
    existing = _load_manifest(manifest)

    fetched: list[ManifestRow] = []
    seen_run: set[str] = set()
    with httpx.Client(headers={"User-Agent": _TOOL}) as client:
        for domain in DOMAINS:
            # Gather up to per_domain unique PMCIDs across this domain's queries.
            ids: list[str] = []
            for q in domain.queries:
                if len(ids) >= per_domain:
                    break
                for pmcid in search_oa(client, build_query(q), per_domain):
                    sid = f"PMC{pmcid}"
                    if sid in seen_run:
                        continue
                    seen_run.add(sid)
                    ids.append(pmcid)
                    if len(ids) >= per_domain:
                        break
            log(f"[{domain.key}] {domain.label}: {len(ids)} candidates")
            for pmcid in ids:
                row = _process_pmcid(client, pmcid, domain.key, raw, existing, force, log)
                if row:
                    fetched.append(row)

    _write_manifest(manifest, existing)
    kept = sum(1 for r in existing.values() if r["status"] == "relevant")
    log(f"manifest: {len(existing)} rows ({kept} relevant) → {manifest}")
    return fetched


def run_fetch(query: str, limit: int, *, raw_dir: str, manifest_path: str,
              force: bool = False, log=print) -> list[ManifestRow]:
    """Single ad-hoc query fetch (no domain tag)."""
    raw = Path(raw_dir); raw.mkdir(parents=True, exist_ok=True)
    manifest = Path(manifest_path)
    existing = _load_manifest(manifest)

    fetched: list[ManifestRow] = []
    with httpx.Client(headers={"User-Agent": _TOOL}) as client:
        ids = search_oa(client, query, limit)
        log(f"esearch: {len(ids)} PMCIDs for {query!r}")
        for pmcid in ids:
            row = _process_pmcid(client, pmcid, None, raw, existing, force, log)
            if row:
                fetched.append(row)

    _write_manifest(manifest, existing)
    log(f"manifest: {len(existing)} total rows → {manifest}")
    return fetched

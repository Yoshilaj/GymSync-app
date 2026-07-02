"""
Fetch PMC Open-Access articles and build the sources manifest (plan §2).

esearch (db=pmc, "open access[filter]") → PMCIDs, then efetch (db=pmc) → JATS XML saved
under data/raw/ (gitignored). Each fetched doc is parsed for lightweight metadata to build
data/sources.jsonl — a manifest checked into the repo so the corpus is reproducible and
auditable (one row per doc: source_id, url, title, doc_type, year, license, status).

Pure-stdlib-plus-httpx; no app.config/DB imports, so `fetch` runs without app credentials.
NCBI etiquette: we send tool (+ optional email/api_key from env) and rate-limit to ≤3 req/s
(≤10 with NCBI_API_KEY). Fetching is idempotent/resumable — a source already on disk and in
the manifest is skipped unless force=True.
"""
import json
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import httpx

from app.ingest.parse import parse_jats

_EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
_OA_FILTER = "open access[filter]"
_TOOL = "gymsync-ingest"


@dataclass
class ManifestRow:
    source_id: str
    pmcid: str
    url: str
    title: str
    doc_type: str
    year: int | None
    license: str | None
    n_sections: int
    status: str          # 'fetched' | 'empty' (parsed but no body sections)


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


def search_oa(client: httpx.Client, query: str, limit: int,
              *, mindate: int | None = None, maxdate: int | None = None) -> list[str]:
    """Return up to `limit` PMCIDs in the OA subset matching `query`, most recent first."""
    params = {
        **_common_params(),
        "db": "pmc",
        "term": f"({query}) AND {_OA_FILTER}",
        "retmax": limit,
        "retmode": "json",
        "sort": "pub_date",
    }
    if mindate or maxdate:
        params.update({"datetype": "pdat", "mindate": mindate or 1900, "maxdate": maxdate or 3000})
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


def run_fetch(query: str, limit: int, *, raw_dir: str, manifest_path: str,
              force: bool = False, log=print) -> list[ManifestRow]:
    raw = Path(raw_dir)
    raw.mkdir(parents=True, exist_ok=True)
    manifest = Path(manifest_path)
    existing = _load_manifest(manifest)

    fetched: list[ManifestRow] = []
    with httpx.Client(headers={"User-Agent": _TOOL}) as client:
        ids = search_oa(client, query, limit)
        log(f"esearch: {len(ids)} PMCIDs for {query!r}")
        for pmcid in ids:
            source_id = f"PMC{pmcid}"
            xml_path = raw / f"{source_id}.xml"
            if not force and source_id in existing and xml_path.exists():
                log(f"  skip {source_id} (already fetched)")
                continue

            xml = fetch_article_xml(client, pmcid)
            xml_path.write_bytes(xml)
            doc = parse_jats(xml, source=source_id)
            row = ManifestRow(
                source_id=source_id,
                pmcid=pmcid,
                url=f"https://www.ncbi.nlm.nih.gov/pmc/articles/{source_id}/",
                title=doc.title,
                doc_type=doc.doc_type,
                year=doc.year,
                license=doc.license,
                n_sections=len(doc.sections),
                status="fetched" if doc.sections else "empty",
            )
            existing[source_id] = asdict(row)
            fetched.append(row)
            log(f"  {source_id}: {row.n_sections} sec | {row.status} | {(doc.title or '')[:60]}")
            time.sleep(_throttle_seconds())

    _write_manifest(manifest, existing)
    log(f"manifest: {len(existing)} total rows → {manifest}")
    return fetched

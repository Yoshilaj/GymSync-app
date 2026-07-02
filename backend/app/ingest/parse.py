"""
JATS XML → sections. PMC's Open-Access subset ships as JATS, where document structure is
explicit (<sec>, <title>) — far more reliable than heuristically re-sectioning a PDF, which
is why the plan picks PMC-first for v1.

Pure module: no app/db imports, so it runs without env or credentials. lxml is the only
dependency. We deliberately DROP the parts that pollute retrieval — reference lists, figure/
table blobs, and front/back boilerplate (affiliations, funding, acknowledgements) — keeping
only the readable body prose that a coach would actually cite.
"""
from dataclasses import dataclass, field

from lxml import etree


@dataclass
class Section:
    title: str            # detected heading (may be "" for an untitled lead section)
    text: str             # concatenated paragraph prose of the section


@dataclass
class ParsedDoc:
    source: str           # stable document id (PMC id / filename)
    doc_type: str         # 'study' | 'review' | 'guideline' | ...
    title: str
    year: int | None
    sections: list[Section] = field(default_factory=list)


# Block-level tags whose text is noise for retrieval; stripped before reading prose.
_DROP_TAGS = {"xref", "table-wrap", "fig", "graphic", "disp-formula", "tex-math",
              "ref-list", "table", "media", "supplementary-material"}


def _clean_text(node: etree._Element) -> str:
    """itertext() over a node with the noisy sub-elements removed, whitespace-collapsed."""
    # Work on a copy so we don't mutate the shared tree.
    clone = etree.fromstring(etree.tostring(node))
    etree.strip_elements(clone, *_DROP_TAGS, with_tail=False)
    text = " ".join(clone.itertext())
    return " ".join(text.split())


def _first_text(root: etree._Element, *paths: str) -> str | None:
    for p in paths:
        found = root.findtext(p)
        if found and found.strip():
            return found.strip()
    return None


def _extract_year(root: etree._Element) -> int | None:
    for y in root.iter("year"):
        raw = (y.text or "").strip()
        if raw.isdigit() and len(raw) == 4:
            return int(raw)
    return None


def _extract_sections(body: etree._Element) -> list[Section]:
    sections: list[Section] = []
    top_secs = body.findall("sec")
    if not top_secs:
        # No explicit sections — treat the whole body as one untitled section.
        text = _clean_text(body)
        return [Section(title="", text=text)] if text else []

    for sec in top_secs:
        title_el = sec.find("title")
        title = " ".join(title_el.itertext()).strip() if title_el is not None else ""
        # Only the paragraphs directly (or nested) under this sec; children <sec> come
        # along in itertext but that's fine — a parent section = the whole subtree of prose.
        text = _clean_text(sec)
        # Drop the leading title text from the body so it isn't duplicated in content.
        if title and text.startswith(title):
            text = text[len(title):].strip()
        if text:
            sections.append(Section(title=title, text=text))
    return sections


def _infer_doc_type(root: etree._Element) -> str:
    # <article article-type="research-article" | "review-article" | ...>
    atype = (root.get("article-type") or "").lower()
    if "review" in atype:
        return "review"
    if "guideline" in atype or "guidance" in atype:
        return "guideline"
    return "study"


def parse_jats(xml_bytes: bytes, *, source: str | None = None) -> ParsedDoc:
    """Parse one JATS document. `source` overrides the detected PMC id (e.g. use the filename)."""
    root = etree.fromstring(xml_bytes)

    pmc_id = _first_text(
        root,
        ".//article-id[@pub-id-type='pmc']",
        ".//article-id[@pub-id-type='pmcid']",
        ".//article-id[@pub-id-type='doi']",
    )
    title = _first_text(root, ".//title-group/article-title", ".//article-title") or "(untitled)"
    year = _extract_year(root)
    doc_type = _infer_doc_type(root)

    body = root.find(".//body")
    sections = _extract_sections(body) if body is not None else []

    return ParsedDoc(
        source=source or pmc_id or "unknown",
        doc_type=doc_type,
        title=title,
        year=year,
        sections=sections,
    )


def parse_file(path: str, *, source: str | None = None) -> ParsedDoc:
    with open(path, "rb") as f:
        return parse_jats(f.read(), source=source)

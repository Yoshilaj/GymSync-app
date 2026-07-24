"""
JATS XML → sections. PMC's Open-Access subset ships as JATS, where document structure is
explicit (<sec>, <title>) — far more reliable than heuristically re-sectioning a PDF, which
is why the plan picks PMC-first for v1.

Pure module: no app/db imports, so it runs without env or credentials. lxml is the only
dependency. We deliberately DROP the parts that pollute retrieval — reference lists, figure/
table blobs, and front/back boilerplate (affiliations, funding, acknowledgements) — keeping
only the readable body prose that a coach would actually cite.
"""
import copy
import re
from dataclasses import dataclass, field

from lxml import etree

# Stripping inline citation <xref>s leaves empty brackets behind ("[, ]", "[–]", "()").
# Collapse any bracket/paren group holding only separators, then tidy the spacing.
_EMPTY_CITES = re.compile(r"[\[(]\s*[,;–\-\s]*\s*[\])]")
_SPACE_BEFORE_PUNCT = re.compile(r"\s+([,.;:)])")


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
    license: str | None = None    # detected license type/url (for the manifest audit trail)
    journal: str | None = None    # source journal (audit + relevance gate)
    sections: list[Section] = field(default_factory=list)


# Real PMC efetch XML carries a JATS DOCTYPE and named entities (&alpha; etc.) whose
# definitions live in an external DTD we don't fetch. recover=True skips what it can't
# resolve; no_network=True guarantees we never reach out mid-parse.
_PARSER = etree.XMLParser(recover=True, no_network=True, resolve_entities=False,
                          load_dtd=False, huge_tree=True)


# Block-level tags whose text is noise for retrieval; stripped before reading prose.
_DROP_TAGS = {"xref", "table-wrap", "fig", "graphic", "disp-formula", "tex-math",
              "ref-list", "table", "media", "supplementary-material"}

# Back-matter sections that carry no retrievable knowledge — dropped by (lowercased,
# substring-matched) title so they never become parents/chunks.
_DROP_SECTIONS = (
    "acknowledg", "funding", "author contribution", "conflict of interest",
    "conflicts of interest", "competing interest", "ethic", "data availability",
    "abbreviation", "supplementary", "declaration", "consent to", "orcid",
    "disclosure", "financial support",
)


def _is_boilerplate(title: str) -> bool:
    t = title.lower()
    return any(kw in t for kw in _DROP_SECTIONS)


def _clean_text(node: etree._Element) -> str:
    """itertext() over a node with the noisy sub-elements removed, whitespace-collapsed."""
    # Work on a copy so we don't mutate the shared tree. deepcopy (not a serialize/reparse
    # round-trip) so unresolved DTD entity refs don't blow up re-parsing.
    clone = copy.deepcopy(node)
    etree.strip_elements(clone, *_DROP_TAGS, with_tail=False)
    text = " ".join(clone.itertext())
    text = " ".join(text.split())
    text = _EMPTY_CITES.sub("", text)          # drop "[, ]" left by removed citations
    text = _SPACE_BEFORE_PUNCT.sub(r"\1", text)  # "word ." → "word."
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
        if _is_boilerplate(title):
            continue
        # Read the whole subtree as prose, but drop THIS section's own <label>/<title>
        # first so the heading number ("1") and title text don't duplicate into content.
        # (Nested subsection headings are kept — useful in-context structure.)
        body = copy.deepcopy(sec)
        for child in list(body):
            if child.tag in ("label", "title"):
                body.remove(child)
        text = _clean_text(body)
        if text:
            sections.append(Section(title=title, text=text))
    return sections


def _infer_doc_type(article: etree._Element) -> str:
    # <article article-type="research-article" | "review-article" | ...>
    atype = (article.get("article-type") or "").lower()
    if "review" in atype:
        return "review"
    if "guideline" in atype or "guidance" in atype:
        return "guideline"
    return "study"


def _extract_license(article: etree._Element) -> str | None:
    lic = article.find(".//permissions/license")
    if lic is None:
        return None
    # Prefer a machine-readable type/href; fall back to a short text snippet.
    href = lic.get("{http://www.w3.org/1999/xlink}href")
    link = lic.find(".//ext-link")
    if link is not None and not href:
        href = link.get("{http://www.w3.org/1999/xlink}href")
    ltype = lic.get("license-type")
    if href:
        return f"{ltype} {href}".strip() if ltype else href
    if ltype:
        return ltype
    text = " ".join(" ".join(lic.itertext()).split())
    return text[:160] or None


def parse_jats(xml_bytes: bytes, *, source: str | None = None) -> ParsedDoc:
    """Parse one JATS document. `source` overrides the detected PMC id (e.g. use the filename).

    Handles the efetch <pmc-articleset> wrapper by locating the first <article> element.
    """
    root = etree.fromstring(xml_bytes, _PARSER)
    if root is None:
        raise ValueError("unparseable XML (empty tree)")
    article = root if root.tag == "article" else root.find(".//article")
    if article is None:
        article = root  # last resort: treat the root as the article scope

    pmc_id = _first_text(
        article,
        ".//article-id[@pub-id-type='pmc']",
        ".//article-id[@pub-id-type='pmcid']",
        ".//article-id[@pub-id-type='doi']",
    )
    title = _first_text(article, ".//title-group/article-title", ".//article-title") or "(untitled)"
    year = _extract_year(article)
    doc_type = _infer_doc_type(article)
    license = _extract_license(article)
    journal = _first_text(article, ".//journal-meta//journal-title", ".//journal-title")

    body = article.find(".//body")
    sections = _extract_sections(body) if body is not None else []

    # PMC ids from efetch are bare numbers; normalize to the PMC-prefixed source id.
    detected = pmc_id
    if detected and detected.isdigit():
        detected = f"PMC{detected}"

    return ParsedDoc(
        source=source or detected or "unknown",
        doc_type=doc_type,
        title=title,
        year=year,
        license=license,
        journal=journal,
        sections=sections,
    )


def parse_file(path: str, *, source: str | None = None) -> ParsedDoc:
    with open(path, "rb") as f:
        return parse_jats(f.read(), source=source)

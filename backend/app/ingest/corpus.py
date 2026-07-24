"""
Corpus curation config — the "picky librarian" rules that turn a broad PMC search into a
fitness-relevant knowledge base (plan Part C / M3).

Empirically chosen mechanism (validated against live PMC): field-tagged `[Title/Abstract]`
queries + relevance sort return applied human sports-science, whereas free-text or `[MeSH]`
queries pull cell/rodent basic-science and off-topic clinical papers. We further exclude
animal / in-vitro studies, and apply a keyword relevance gate (`is_relevant`) as a backstop.

Pure data + helpers — no I/O, no app/db imports.
"""
from dataclasses import dataclass

# Applied human coaching knowledge only — drop basic-science (cell/animal) studies that share
# vocabulary ("hypertrophy") but aren't usable coaching content.
_EXCLUDE = (
    'NOT (mouse[Title/Abstract] OR mice[Title/Abstract] OR rat[Title/Abstract] '
    'OR rats[Title/Abstract] OR rodent[Title/Abstract] OR "in vitro"[Title/Abstract] '
    'OR "cell culture"[Title/Abstract] OR murine[Title/Abstract])'
)


@dataclass(frozen=True)
class Domain:
    key: str          # short id, tagged onto each manifest row
    label: str
    queries: tuple    # PMC terms, each already field-tagged; _EXCLUDE is appended at fetch time


# The five RAG-homed knowledge domains (plan Part A). Each query targets applied, human,
# practical evidence via [Title/Abstract] anchors.
DOMAINS: tuple = (
    Domain("technique", "Technique & biomechanics", (
        '"resistance training"[Title/Abstract] AND (technique[Title/Abstract] OR "exercise form"[Title/Abstract] OR biomechanics[Title/Abstract])',
        '(squat[Title/Abstract] OR deadlift[Title/Abstract] OR "bench press"[Title/Abstract]) AND (kinematics[Title/Abstract] OR technique[Title/Abstract] OR "muscle activation"[Title/Abstract])',
    )),
    Domain("programming", "Programming & periodization", (
        '"resistance training"[Title/Abstract] AND (periodization[Title/Abstract] OR periodisation[Title/Abstract] OR programming[Title/Abstract])',
        '"resistance training"[Title/Abstract] AND ("training volume"[Title/Abstract] OR "training frequency"[Title/Abstract] OR "training intensity"[Title/Abstract])',
        '"progressive overload"[Title/Abstract] AND (strength[Title/Abstract] OR hypertrophy[Title/Abstract])',
    )),
    Domain("injury", "Injury prevention & rehab", (
        '("resistance training"[Title/Abstract] OR weightlifting[Title/Abstract] OR "strength training"[Title/Abstract]) AND (injury[Title/Abstract] OR "injury prevention"[Title/Abstract])',
        '("low back pain"[Title/Abstract] OR tendinopathy[Title/Abstract]) AND (exercise[Title/Abstract] OR "resistance training"[Title/Abstract] OR rehabilitation[Title/Abstract])',
    )),
    Domain("nutrition", "Sports nutrition", (
        '("dietary protein"[Title/Abstract] OR "protein intake"[Title/Abstract]) AND (muscle[Title/Abstract] OR hypertrophy[Title/Abstract] OR "resistance training"[Title/Abstract])',
        '"sports nutrition"[Title/Abstract] OR ("energy balance"[Title/Abstract] AND "body composition"[Title/Abstract])',
        'creatine[Title/Abstract] AND (strength[Title/Abstract] OR "resistance training"[Title/Abstract] OR performance[Title/Abstract])',
    )),
    Domain("health", "General health & recovery", (
        '(sleep[Title/Abstract] OR "muscle recovery"[Title/Abstract]) AND ("resistance training"[Title/Abstract] OR "athletic performance"[Title/Abstract])',
        '"physical activity"[Title/Abstract] AND ("cardiovascular health"[Title/Abstract] OR "health outcomes"[Title/Abstract] OR guidelines[Title/Abstract])',
    )),
)


def build_query(raw: str) -> str:
    """Wrap a domain query with the OA filter (added downstream) and the animal/in-vitro exclusion."""
    return f"({raw}) {_EXCLUDE}"


# Reputable sports-science / exercise / nutrition journals (lowercased substrings of the PMC
# `fulljournalname`). A hit here is a strong relevance signal → auto-pass the gate.
JOURNAL_ALLOWLIST: frozenset = frozenset({
    "strength and conditioning", "sports medicine", "sports med", "sports science",
    "sport and health", "applied physiology", "science in sports", "physiology",
    "international society of sports nutrition", "nutrients", "sports (basel)",
    "sports physiology and performance", "medicine and science in sports",
})

# Distinct terms that signal genuine exercise-science content. _CORE carries the strongest
# signal; the gate needs at least one CORE term plus a few total.
_CORE = {
    "resistance training", "strength training", "hypertrophy", "weightlifting", "weight lifting",
    "muscle strength", "athletic performance", "periodization", "periodisation",
    "sports nutrition", "progressive overload", "one repetition maximum", "1rm",
}
FITNESS_LEXICON = _CORE | {
    "resistance", "strength", "muscle", "muscular", "training", "exercise", "workout",
    "squat", "deadlift", "bench press", "repetition", "set", "overload", "athlete",
    "athletic", "conditioning", "endurance", "protein", "nutrition", "creatine",
    "recovery", "tendon", "tendinopathy", "rehabilitation", "mobility", "adaptation",
    "physical activity", "fatigue", "performance",
}

_MIN_TOTAL = 3   # distinct lexicon terms required (when not journal-allowlisted)


def is_relevant(title: str, text: str, journal: str | None = None) -> tuple:
    """Backstop relevance gate. Returns (passed, hits).

    Auto-passes if the source is an allow-listed sports-science journal; otherwise requires at
    least one CORE term AND >= _MIN_TOTAL distinct lexicon terms across title + body.
    """
    hay = f"{title} {text}".lower()
    hits = {term for term in FITNESS_LEXICON if term in hay}
    core = hits & _CORE
    if journal and any(a in journal.lower() for a in JOURNAL_ALLOWLIST):
        return True, hits
    return (bool(core) and len(hits) >= _MIN_TOTAL), hits

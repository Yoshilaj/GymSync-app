"""
Security pipeline for the agent chokepoint.

  InputSanitizer  — cheap regex prompt-injection heuristics + delimiter neutralization.
  PIIDetector     — detect + mask emails/phones/SSNs/cards/IPs.
  OutputValidator — scan generated text for leaked secrets / obvious harmful patterns.
  SecurityPipeline — the façade agents.core uses. Tuple contracts, no exceptions:
        process_input(text, channel)  -> (clean_text, InputFlags)   # runs BEFORE the model
        observe_output(text, channel) -> OutputFlags                # observe-only, no mutation

Design constraints (streaming coach):
  • Detectors are pure regex — never an LLM call — to stay inside the ~1s voice budget.
  • Output is NEVER rewritten in the live path: the coach speaks to its own data subject,
    and buffering to mask would destroy TTFT. PII is masked only in the observability sink.
  • Per-channel policy: text may block on high-severity injection; voice never blocks
    (interrupting a set is worse UX than answering a weird prompt) — the flag is still recorded.
"""
import re
from dataclasses import dataclass, field
from typing import Literal

Channel = Literal["text", "voice"]


# ── Prompt-injection heuristics ───────────────────────────────────────────────

_INJECTION_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions",
        r"disregard\s+(all\s+)?(previous|prior|the)\s+",
        r"system\s*prompt",
        r"you\s+are\s+now\s+",
        r"pretend\s+(you\s+are|to\s+be)\s+",
        r"act\s+as\s+(if\s+you|a)\s+",
        r"bypass\s+(all\s+)?(restrictions|rules|guardrails|safety)",
        r"reveal\s+(your\s+)?(system\s+)?(prompt|instructions)",
        r"(developer|admin|root)\s+mode",
    )
]


class InputSanitizer:
    """Flag likely prompt-injection and neutralize prompt-structure delimiters."""

    @staticmethod
    def check(text: str) -> tuple[bool, str | None]:
        for pat in _INJECTION_PATTERNS:
            if pat.search(text):
                return False, pat.pattern
        return True, None

    @staticmethod
    def sanitize(text: str) -> str:
        # Neutralize section delimiters and template braces a caller might use to
        # break out of the user turn. Cheap and lossless for normal fitness talk.
        text = re.sub(r"[-=]{3,}", " ", text)
        text = text.replace("{{", "{ {").replace("}}", "} }")
        return text.strip()


# ── PII ───────────────────────────────────────────────────────────────────────

_PII_PATTERNS: dict[str, re.Pattern] = {
    "email": re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"),
    "phone": re.compile(r"\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "credit_card": re.compile(r"\b(?:\d[ -]?){13,16}\b"),
    "ip_address": re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
}

_PII_MASK = {
    "email": "[EMAIL]",
    "phone": "[PHONE]",
    "ssn": "[SSN]",
    "credit_card": "[CARD]",
    "ip_address": "[IP]",
}


class PIIDetector:
    @staticmethod
    def detect(text: str) -> dict[str, int]:
        """Return {pii_type: match_count} for whatever appears. Empty if clean."""
        found: dict[str, int] = {}
        for kind, pat in _PII_PATTERNS.items():
            n = len(pat.findall(text))
            if n:
                found[kind] = n
        return found

    @staticmethod
    def mask(text: str) -> str:
        """Replace PII with type tokens. Used for logs/traces ONLY, never the live path."""
        for kind, pat in _PII_PATTERNS.items():
            text = pat.sub(_PII_MASK[kind], text)
        return text


# ── Output validation ─────────────────────────────────────────────────────────

_HARMFUL_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r"api[_-]?key\s*[:=]",
        r"secret[_-]?key\s*[:=]",
        r"password\s+is\s+",
        r"BEGIN\s+(RSA|OPENSSH|PRIVATE)\s+KEY",
    )
]


class OutputValidator:
    @staticmethod
    def scan(text: str) -> list[str]:
        """Return a list of triggered concern labels (secret-leak / PII). Observe-only."""
        concerns: list[str] = []
        for pat in _HARMFUL_PATTERNS:
            if pat.search(text):
                concerns.append(f"secret_leak:{pat.pattern[:24]}")
        if PIIDetector.detect(text):
            concerns.append("pii_in_output")
        return concerns


# ── Façade ────────────────────────────────────────────────────────────────────

@dataclass
class InputFlags:
    injection_suspected: bool = False
    injection_pattern: str | None = None
    pii_types: dict[str, int] = field(default_factory=dict)
    blocked: bool = False  # text channel may set this; voice never does


@dataclass
class OutputFlags:
    concerns: list[str] = field(default_factory=list)
    pii_types: dict[str, int] = field(default_factory=dict)
    masked_sample: str | None = None  # PII-masked preview for the log sink


class SecurityPipeline:
    """Stateless façade. Detection is channel-independent; only the RESPONSE differs."""

    @staticmethod
    def process_input(text: str, channel: Channel = "text") -> tuple[str, InputFlags]:
        ok, pattern = InputSanitizer.check(text)
        flags = InputFlags(
            injection_suspected=not ok,
            injection_pattern=pattern,
            pii_types=PIIDetector.detect(text),
        )
        # Voice never blocks mid-workout; text blocks only on a hard injection hit.
        flags.blocked = (not ok) and channel == "text"
        clean = InputSanitizer.sanitize(text)
        return clean, flags

    @staticmethod
    def observe_output(text: str, channel: Channel = "text") -> OutputFlags:
        pii = PIIDetector.detect(text)
        flags = OutputFlags(concerns=OutputValidator.scan(text), pii_types=pii)
        if pii or flags.concerns:
            flags.masked_sample = PIIDetector.mask(text)[:280]
        return flags

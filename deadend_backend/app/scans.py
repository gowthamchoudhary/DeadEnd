"""Safety scans (shared logic with scripts/curator.py): secret scan,
prompt-injection scan, deterministic redaction, context-pack injection
stripping. Runs on EVERY ingest and EVERY global contribution.

Patterns use no inline global flags: Python 3.11+ rejects them when they
appear anywhere but the start of the expression (and joining patterns
into an alternation always puts them mid-expression). Case-insensitivity
is applied via re.IGNORECASE at the compile/search call sites instead.
"""
import re

# every pattern is case-insensitive -> compiled/searched with re.I
SECRET_PATTERNS = [
    (r"AKIA[0-9A-Z]{16}", "aws-access-key"),
    (r"sk-[A-Za-z0-9_-]{20,}", "openai-style-key"),
    (r"aV5[A-Za-z0-9_-]{25,}", "neatlogs-style-key"),
    (r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", "jwt"),
    (r"-----BEGIN( [A-Z]+)? PRIVATE KEY-----", "private-key"),
    (r"(postgres(?:ql)?|mysql|mongodb(?:\+srv)?)://[^\s:@]+:[^\s@]+@", "connection-string"),
    (r"bearer\s+[A-Za-z0-9._-]{20,}", "bearer-token"),
    (r"gh[pousr]_[A-Za-z0-9]{30,}", "github-token"),
    (r"xox[baprs]-[A-Za-z0-9-]{10,}", "slack-token"),
]
INJECTION_PATTERNS = [
    (r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions", "instruction-override"),
    (r"disregard\s+(the\s+)?(system|previous|above)", "instruction-override"),
    (r"\b(exfiltrate|send|post)\b.{0,40}\b(api.?key|secret|token|credentials)\b", "exfiltration"),
    (r"you\s+are\s+now\s+(a|an)\s+", "role-hijack"),
    (r"\bsudo\b|\brm\s+-rf\b.{0,30}(no-preserve-root|/)", "destructive-command"),
    (r"print|reveal|show.{0,30}(system\s+prompt|instructions)", "prompt-leak"),
]
REDACT = [
    (r"AKIA[0-9A-Z]{16}", "[REDACTED:aws-key]"),
    (r"sk-[A-Za-z0-9_-]{20,}", "[REDACTED:key]"),
    (r"aV5[A-Za-z0-9_-]{25,}", "[REDACTED:key]"),
    (r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", "[REDACTED:jwt]"),
    (r"(postgres(?:ql)?|mysql|mongodb(?:\+srv)?)://[^\s:@]+:[^\s@]+@", r"\1://[REDACTED]@"),
    (r"bearer\s+[A-Za-z0-9._-]{20,}", "bearer [REDACTED]"),
    (r"gh[pousr]_[A-Za-z0-9]{30,}", "[REDACTED:github-token]"),
    (r"xox[baprs]-[A-Za-z0-9-]{10,}", "[REDACTED:slack-token]"),
]
STRIP_INJECTION_RE = re.compile("|".join(f"({p})" for p, _ in INJECTION_PATTERNS),
                                re.IGNORECASE)

# precompiled single-pattern matchers/replacers (re.I everywhere)
_SECRET_RE = [(re.compile(pat, re.IGNORECASE), name) for pat, name in SECRET_PATTERNS]
_INJECTION_RE = [(re.compile(pat, re.IGNORECASE), name) for pat, name in INJECTION_PATTERNS]
_REDACT_RE = [(pat and re.compile(pat, re.IGNORECASE) or re.compile(pat), repl)
              for pat, repl in REDACT]


def secret_scan(text: str) -> list[str]:
    return [name for cre, name in _SECRET_RE if cre.search(text or "")]


def injection_scan(text: str) -> list[str]:
    return [name for cre, name in _INJECTION_RE if cre.search(text or "")]


def scan_all(text: str) -> dict:
    return {"secrets": secret_scan(text), "injection": injection_scan(text)}


def redact(text: str) -> str:
    for cre, repl in _REDACT_RE:
        text = cre.sub(repl, text or "")
    return text


def strip_injection_from_context(text: str) -> str:
    """Global entries are data, never instructions: patterns are stripped
    from retrieved packs at render time."""
    return STRIP_INJECTION_RE.sub("[stripped:injection-pattern]", text or "")

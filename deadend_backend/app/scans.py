"""Safety scans (shared logic with scripts/curator.py): secret scan,
prompt-injection scan, deterministic redaction, context-pack injection
stripping. Runs on EVERY ingest and EVERY global contribution."""
import re

SECRET_PATTERNS = [
    (r"AKIA[0-9A-Z]{16}", "aws-access-key"),
    (r"sk-[A-Za-z0-9_-]{20,}", "openai-style-key"),
    (r"aV5[A-Za-z0-9_-]{25,}", "neatlogs-style-key"),
    (r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", "jwt"),
    (r"-----BEGIN( [A-Z]+)? PRIVATE KEY-----", "private-key"),
    (r"(?i)(postgres|mysql|mongodb(\+srv)?)://[^\s:@]+:[^\s@]+@", "connection-string"),
    (r"(?i)bearer\s+[A-Za-z0-9._-]{20,}", "bearer-token"),
    (r"(?i)gh[pousr]_[A-Za-z0-9]{30,}", "github-token"),
    (r"(?i)xox[baprs]-[A-Za-z0-9-]{10,}", "slack-token"),
]
INJECTION_PATTERNS = [
    (r"(?i)ignore\s+(all\s+)?(previous|prior|above)\s+instructions", "instruction-override"),
    (r"(?i)disregard\s+(the\s+)?(system|previous|above)", "instruction-override"),
    (r"(?i)\b(exfiltrate|send|post)\b.{0,40}\b(api.?key|secret|token|credentials)\b", "exfiltration"),
    (r"(?i)you\s+are\s+now\s+(a|an)\s+", "role-hijack"),
    (r"(?i)\bsudo\b|\brm\s+-rf\b.{0,30}(no-preserve-root|/)", "destructive-command"),
    (r"(?i)print|reveal|show.{0,30}(system\s+prompt|instructions)", "prompt-leak"),
]
REDACT = [
    (r"AKIA[0-9A-Z]{16}", "[REDACTED:aws-key]"),
    (r"sk-[A-Za-z0-9_-]{20,}", "[REDACTED:key]"),
    (r"aV5[A-Za-z0-9_-]{25,}", "[REDACTED:key]"),
    (r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", "[REDACTED:jwt]"),
    (r"(?i)(postgres|mysql|mongodb(\+srv)?)://[^\s:@]+:[^\s@]+@", r"\1://[REDACTED]@"),
    (r"(?i)bearer\s+[A-Za-z0-9._-]{20,}", "bearer [REDACTED]"),
    (r"(?i)gh[pousr]_[A-Za-z0-9]{30,}", "[REDACTED:github-token]"),
    (r"(?i)xox[baprs]-[A-Za-z0-9-]{10,}", "[REDACTED:slack-token]"),
]
STRIP_INJECTION_RE = re.compile("|".join(f"({p})" for p, _ in INJECTION_PATTERNS), re.I)


def secret_scan(text: str) -> list[str]:
    return [name for pat, name in SECRET_PATTERNS if re.search(pat, text or "")]


def injection_scan(text: str) -> list[str]:
    return [name for pat, name in INJECTION_PATTERNS if re.search(pat, text or "")]


def scan_all(text: str) -> dict:
    return {"secrets": secret_scan(text), "injection": injection_scan(text)}


def redact(text: str) -> str:
    for pat, repl in REDACT:
        text = re.sub(pat, repl, text or "")
    return text


def strip_injection_from_context(text: str) -> str:
    """Global entries are data, never instructions: patterns are stripped
    from retrieved packs at render time."""
    return STRIP_INJECTION_RE.sub("[stripped:injection-pattern]", text or "")

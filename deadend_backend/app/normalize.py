import hashlib
import re


def normalize_stack(text: str) -> str:
    t = re.sub(r"0x[0-9a-fA-F]+", "0xADDR", text or "")
    t = re.sub(r'File "[^"]+", line \d+', "File <path>, line N", t)
    t = re.sub(r"/[\w./-]+/([\w.-]+\.[a-z]+)", "<mod>\\1", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def signature_hash(text: str) -> str:
    return hashlib.sha256(normalize_stack(text or "").encode()).hexdigest()[:16]

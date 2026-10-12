"""Dependency-free lexical matching used by retrieval's fallback search."""

import re


def terms(text: str) -> set[str]:
    """Return normalized content words, including domain-specific terms.

    This is a deliberately small lexical fallback (not a semantic embedding
    model). It preserves useful words such as ``urgent`` and ``network`` and
    folds common plurals and verb endings so related user phrasing overlaps.
    """
    stop = {
        "about", "after", "again", "also", "and", "are", "because", "but",
        "for", "from", "have", "into", "its", "not", "once", "only", "same",
        "should", "that", "the", "their", "them", "then", "there", "these",
        "this", "those", "through", "when", "while", "with", "without",
        "would", "your", "you", "can", "could", "make", "keep", "gets",
        "getting", "what", "where", "which", "who", "will",
    }
    out: set[str] = set()
    for word in re.findall(r"[a-z0-9]+", (text or "").lower()):
        if len(word) < 3 or word in stop:
            continue
        if word.endswith("ies") and len(word) > 4:
            word = word[:-3] + "y"
        elif word.endswith("ing") and len(word) > 5:
            word = word[:-3]
            if len(word) > 3 and word[-1] == word[-2]:
                word = word[:-1]
        elif word.endswith("ed") and len(word) > 4:
            word = word[:-2]
            if len(word) > 3 and word[-1] == word[-2]:
                word = word[:-1]
        elif word.endswith("s") and len(word) > 4 and not word.endswith("ss"):
            word = word[:-1]
        out.add(word)
    return out

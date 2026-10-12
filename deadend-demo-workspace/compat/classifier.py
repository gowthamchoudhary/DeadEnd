from __future__ import annotations

"""Version-tolerant shim for the demo classifier.

The point of this file is to make the demo failure look like a real
"our code behaves differently depending on dependency version" situation
without actually depending on a giant migration surface.
"""

from typing import Literal

Category = Literal["hardware", "account", "network", "other"]
Priority = Literal["low", "medium", "high"]


def _normalise_priority_input(priority: object) -> str:
    """Compat shim: older helper paths accepted a few missense forms.

    Keep this for the demo so the bug can be "we passed a priority form the
    old helper still accepted, but the new helper tightened validation."
    """
    if isinstance(priority, str):
        lowered = priority.lower().strip()
        if lowered in {"high", "urgent", "critical"}:
            return "high"
        if lowered in {"medium", "normal", "moderate"}:
            return "medium"
        if lowered in {"low", "minor", "trivial"}:
            return "low"
    raise ValueError(f"cannot normalise priority: {priority!r}")


def classify_with_compat(message: str, priority_override: object = None) -> tuple[str, str, str]:
    """Compat wrapper used by a legacy integration path in the demo.

    This is the compatibility seam used by the demo: a legacy override can
    currently bypass the classifier's urgency result.
    """
    from apps.classifier import classify_ticket
    category, priority, answer = classify_ticket(message)
    if priority_override is not None:
        priority = _normalise_priority_input(priority_override)
    return category, priority, answer


if __name__ == "__main__":
    import sys
    msg = sys.argv[1] if len(sys.argv) > 1 else "My laptop won't boot after the update."
    cat, pri, ans = classify_with_compat(msg)
    print(f"{cat} / {pri} / {ans}")

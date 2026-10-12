from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["hardware", "account", "network", "other"]
Priority = Literal["low", "medium", "high"]


class ClassifiedTicket(BaseModel):
    category: Category
    priority: Priority
    answer: str


# Deterministic headline answers for demo categories.

_ANSWERS: dict[Category, dict[Priority, str]] = {
    "hardware": {
        "low": "Log it for the next site visit and confirm the user's asset tag.",
        "medium": "Raise a hardware ticket and note the affected machine.",
        "high": "Escalate to on-site support — the user is blocked.",
    },
    "account": {
        "low": "Reset instructions were sent to the registered contact.",
        "medium": "Verify identity before touching the account.",
        "high": "Treat as a possible account compromise and escalate.",
    },
    "network": {
        "low": "Check the local switch port and confirm cabling.",
        "medium": "Open a network case and trace the affected segment.",
        "high": "The user may be off the network — escalate now.",
    },
    "other": {
        "low": "Log it under general enquiries.",
        "medium": "Ask for more detail before routing.",
        "high": "If the user is blocked, escalate to the ops queue.",
    },
}


def _pick_answer(category: Category, priority: Priority) -> str:
    return _ANSWERS.get(category, _ANSWERS["other"]).get(priority,
                                                         _ANSWERS["other"]["medium"])


def _classify_by_keywords(message: str) -> tuple[Category, Priority]:
    lowered = message.lower()

    if any(k in lowered for k in ("laptop", "boot", "printer", "jam",
                                   "monitor", "keyboard", "mouse", "battery",
                                   "screen", "won't boot", "not turning on")):
        category: Category = "hardware"
    elif any(k in lowered for k in ("password", "reset", "lock", "account",
                                     "sso", "sign in", "login", "locked out")):
        category = "account"
    elif any(k in lowered for k in ("vpn", "wi-fi", "wifi", "network", "dns",
                                     "no internet", "connectivity", "floor 3",
                                     "subnet", "proxy")):
        category = "network"
    else:
        category = "other"

    # Priority from urgency cues.
    high_cues = ("can't work", "blocked", "down", "urgent", "asap", "immediately",
                 "won't boot", "won't connect")
    medium_cues = ("again", "every time", "reproduces", "multiple users",
                   "several times")
    if any(k in lowered for k in high_cues):
        priority: Priority = "high"
    elif any(k in lowered for k in medium_cues):
        priority = "medium"
    else:
        priority = "low"

    return category, priority


def classify_ticket(message: str) -> tuple[Category, Priority, str]:
    """Classify a support-desk message into category + priority + templated answer.

    This is intentionally small and deterministic so the demo failure and fix
    can be understood without domain knowledge.
    """
    category, priority = _classify_by_keywords(message)
    answer = _pick_answer(category, priority)
    return category, priority, answer

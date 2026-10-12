from __future__ import annotations

import hashlib
from uuid import uuid4

from apps.classifier import classify_ticket

# In-memory ticket store for the demo. Real app, fake persistence.


def create_ticket(message: str, category: str,
                  priority: str, answer: str) -> str:
    raw = f"{message}\n{category}\n{priority}\n{answer}"
    ticket_id = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    row = {
        "ticket_id": ticket_id,
        "message": message,
        "category": category,
        "priority": priority,
        "answer": answer,
    }
    _store[ticket_id] = row
    return ticket_id


_store: dict[str, dict] = {}


def _reset_ticket_store() -> None:
    _store.clear()


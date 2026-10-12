from __future__ import annotations

import hashlib
from uuid import uuid4

from apps.classifier import classify_ticket

# In-memory ticket store for the demo. Real app, fake persistence.


def create_ticket(ticket_store: dict[str, dict], message: str, category: str,
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
    ticket_store[ticket_id] = row
    return ticket_id


def _reset_ticket_store(ticket_store: dict[str, dict]) -> None:
    ticket_store.clear()


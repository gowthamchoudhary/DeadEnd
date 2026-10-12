"""ticketdesk-api — tiny in-memory IT support desk used as a DeadEnd demo target."""

from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from apps.classifier import classify_ticket
from apps.tickets import create_ticket, _reset_ticket_store
from apps.versionz import pydantic_version_tag

app = FastAPI(title="ticketdesk-api", version="0.1.0")


class TicketIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)


class TicketOut(BaseModel):
    ticket_id: str
    category: str
    priority: str
    answer: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/versionz")
def versionz() -> dict:
    return {"service": "ticketdesk-api", "pydantic": pydantic_version_tag()}


@app.post("/tickets", response_model=TicketOut)
def post_ticket(body: TicketIn) -> TicketOut:
    if not body.message.strip():
        raise HTTPException(400, "message must not be empty")
    category, priority, answer = classify_ticket(body.message)
    ticket_id = create_ticket(body.message, category, priority, answer)
    return TicketOut(ticket_id=ticket_id, category=category,
                     priority=priority, answer=answer)


@app.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: str) -> dict:
    row = _store().get(ticket_id)
    if not row:
        raise HTTPException(404, "ticket not found")
    return row


_ticket_store: dict[str, dict] = {}


def _store() -> dict[str, dict]:
    return _ticket_store


def _reset_store() -> None:
    _ticket_store.clear()


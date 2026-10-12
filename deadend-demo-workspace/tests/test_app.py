from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient

import app as app_module

client = TestClient(app_module.app)


def test_health_returns_ok() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_versionz_reports_pydantic_version() -> None:
    resp = client.get("/versionz")
    assert resp.status_code == 200
    data = resp.json()
    assert data["service"] == "ticketdesk-api"
    assert re.match(r"^\d+\.\d+", data["pydantic"])


@pytest.mark.parametrize(
    "message,expected_categories",
    [
        ("My laptop won't boot after the update.", {"hardware"}),
        ("How do I reset my VPN password?", {"account", "network"}),
        ("Printer on floor 3 is jammed again.", {"hardware"}),
        ("Completely unrelated gibberish about nothing at all.",
         {"other"}),
    ],
)
def test_ticket_classification(message: str,
                              expected_categories: set[str]) -> None:
    resp = client.post("/tickets", json={"message": message})
    assert resp.status_code == 200
    data = resp.json()
    assert data["category"] in expected_categories
    assert data["priority"] in {"low", "medium", "high"}
    assert isinstance(data["answer"], str) and data["answer"]
    assert isinstance(data["ticket_id"], str) and data["ticket_id"]


def test_ticket_id_is_deterministic() -> None:
    message = "My laptop won't boot after the update."
    resp1 = client.post("/tickets", json={"message": message})
    resp2 = client.post("/tickets", json={"message": message})
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert resp1.json()["ticket_id"] == resp2.json()["ticket_id"]


def test_different_messages_get_different_ids() -> None:
    resp1 = client.post("/tickets",
                        json={"message": "Printer on floor 3 is jammed again."})
    resp2 = client.post("/tickets",
                        json={"message": "How do I reset my VPN password?"})
    assert resp1.json()["ticket_id"] != resp2.json()["ticket_id"]


def test_empty_message_is_rejected() -> None:
    resp = client.post("/tickets", json={"message": "   "})
    assert resp.status_code == 400

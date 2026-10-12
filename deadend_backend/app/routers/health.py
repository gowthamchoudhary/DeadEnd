"""Health endpoint.

The extension calls GET /health. Keep /healthz in place too (existing
clients may rely on it), and make /health return the same shape the
extension expects: {"status": "ok"}.
"""
from fastapi import APIRouter

router = APIRouter(tags=["health"])

HEALTH = {"status": "ok"}


@router.get("/health")
def health() -> dict:
    return HEALTH


@router.get("/healthz")
def healthz() -> dict:
    return HEALTH

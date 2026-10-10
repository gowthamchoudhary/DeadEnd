"""Quarantine review + stats for the dashboard."""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (Contribution, Entry, Quarantine, ReuseEvent, Run,
                      TeamMember)
from ..security import current_user, require_role

router = APIRouter(tags=["misc"])


@router.get("/quarantine")
def list_quarantine(team_id: str, u=Depends(current_user), db: Session = Depends(get_db)):
    require_role(db, team_id, u.id)
    rows = db.execute(select(Quarantine).where(Quarantine.team_id == team_id)
                      .order_by(Quarantine.created_at.desc()).limit(100)).scalars().all()
    return [{"id": q.id, "reasons": q.reasons, "payload": q.payload,
             "source": q.source, "created_at": q.created_at.isoformat()} for q in rows]


@router.post("/quarantine/{qid}/dismiss")
def dismiss(qid: str, u=Depends(current_user), db: Session = Depends(get_db)):
    q = db.get(Quarantine, qid)
    if not q:
        raise HTTPException(404, "not found")
    require_role(db, q.team_id, u.id, ("owner", "admin"))
    db.delete(q)
    db.commit()
    return {"dismissed": qid}


@router.get("/stats")
def stats(team_id: str, u=Depends(current_user), db: Session = Depends(get_db)):
    require_role(db, team_id, u.id)
    ents = db.execute(select(Entry).where(Entry.team_id == team_id)).scalars().all()
    ids = [e.id for e in ents]
    reuses = 0
    success = 0
    if ids:
        rset = db.execute(select(ReuseEvent).where(ReuseEvent.entry_id.in_(ids))).scalars().all()
        reuses = sum(1 for r in rset if r.kind == "real")
        success = sum(1 for r in rset if r.kind == "real" and r.outcome == "success")
    sig_counts: dict[str, int] = {}
    for e in ents:
        sig_counts[e.signature_hash] = sig_counts.get(e.signature_hash, 0) + 1
    repeated = {k: v for k, v in sig_counts.items() if v > 1}
    verified = sum(1 for e in ents if e.verified)
    runs = db.execute(select(Run).where(Run.team_id == team_id)).scalars().all()
    ok_runs = sum(1 for r in runs if r.status == "success")
    return {
        "entries": len(ents), "verified": verified,
        "reuse_events": reuses, "reuse_success": success,
        "repeated_signatures": repeated,
        "runs": len(runs), "successful_runs": ok_runs,
        "confidence_distribution": _dist(ents),
        "tokens_saved_estimate": reuses * 12000,
        "note": "estimate = reuses x avg context tokens avoided; no fabricated runs",
    }


def _dist(ents) -> dict:
    buckets = {"low(0-.25)": 0, "mid(.25-.65)": 0, "high(.65+)": 0}
    for e in ents:
        a, b = e.alpha or 1.0, e.beta or 1.0
        p = a / (a + b)
        b_key = "low(0-.25)" if p < .25 else ("mid(.25-.65)" if p < .65 else "high(.65+)")
        buckets[b_key] += 1
    return buckets

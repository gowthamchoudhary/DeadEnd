"""POST /reuse — record a real reuse event and recompute entry confidence.
kind=test events never affect alpha/beta."""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..confidence import env_match
from ..db import get_db
from ..models import Entry, ReuseEvent, TeamMember
from ..security import current_user

router = APIRouter(tags=["reuse"])


class ReuseIn(BaseModel):
    entry_id: str
    run_id: str | None = None
    outcome: str                       # success|failure
    kind: str = "real"                 # real|test (must be explicit)
    env_fingerprint: dict = Field(default_factory=dict)


@router.post("/reuse")
def reuse(body: ReuseIn, u=Depends(current_user), db: Session = Depends(get_db)):
    e = db.get(Entry, body.entry_id)
    if not e:
        raise HTTPException(404, "entry not found")
    if e.scope == "private" and not db.execute(
            select(TeamMember).where(TeamMember.team_id == e.team_id,
                                     TeamMember.user_id == u.id)).scalar_one_or_none():
        raise HTTPException(403, "not a member of this entry's team")
    if body.outcome not in ("success", "failure"):
        raise HTTPException(400, "outcome must be success|failure")
    if body.kind not in ("real", "test"):
        raise HTTPException(400, "kind must be real|test")
    w = env_match(body.env_fingerprint, e.env_fingerprint)
    ev = ReuseEvent(entry_id=e.id, run_id=body.run_id, outcome=body.outcome,
                    kind=body.kind, env_match_weight=w,
                    env_fingerprint=body.env_fingerprint)
    db.add(ev)
    if body.kind == "real":
        e.last_reuse_at = dt.datetime.now(dt.timezone.utc)
        if body.outcome == "success":
            e.alpha += w
        else:
            e.beta += w
    db.commit()
    base = e.alpha / (e.alpha + e.beta)
    return {"reuse_id": ev.id, "alpha": e.alpha, "beta": e.beta,
            "base_confidence": round(base, 4), "kind": body.kind,
            "note": "kind=test events never change alpha/beta"}

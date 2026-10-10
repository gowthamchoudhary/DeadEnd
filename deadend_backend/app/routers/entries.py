"""Entries: list/get/search across private (team) and global scope."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Entry, ReuseEvent, TeamMember
from ..security import current_user, require_role

router = APIRouter(tags=["entries"])


def _entry_view(e: Entry, with_reuses: bool = False) -> dict:
    out = {
        "id": e.id, "scope": e.scope, "team_id": e.team_id,
        "title": e.title, "signature_hash": e.signature_hash,
        "signature_normalized": e.signature_normalized,
        "redacted_error_text": e.redacted_error_text,
        "env_fingerprint": e.env_fingerprint,
        "attempts": e.attempts_graph, "fix": e.fix,
        "constraints": e.constraints,
        "seeded": e.seeded, "verified": e.verified,
        "neatlogs_trace_id": e.neatlogs_trace_id,
        "entire_checkpoint_id": e.entire_checkpoint_id,
        "alpha": e.alpha, "beta": e.beta,
        "created_at": e.created_at.isoformat(),
    }
    return out


@router.get("/entries")
def list_entries(scope: str, team_id: str | None = None, page: int = 1,
                 per_page: int = 20, verified: bool | None = None,
                 u=Depends(current_user), db: Session = Depends(get_db)):
    if scope not in ("private", "global"):
        raise HTTPException(400, "scope must be private|global")
    q = select(Entry).where(Entry.scope == scope)
    if scope == "private":
        if not team_id:
            raise HTTPException(400, "team_id required for private")
        require_role(db, team_id, u.id)
        q = q.where(Entry.team_id == team_id)
    if verified is not None:
        q = q.where(Entry.verified == verified)
    rows = db.execute(q.order_by(Entry.created_at.desc())
                      .offset((max(1, page) - 1) * per_page).limit(per_page)).scalars().all()
    return [{"page": page, "per_page": per_page,
             "entries": [_entry_view(e) for e in rows]}]


@router.get("/entries/{entry_id}")
def get_entry(entry_id: str, u=Depends(current_user), db: Session = Depends(get_db)):
    e = db.get(Entry, entry_id)
    if not e:
        raise HTTPException(404, "entry not found")
    if e.scope == "private":
        require_role(db, e.team_id, u.id)
    out = _entry_view(e)
    reuses = db.execute(select(ReuseEvent).where(ReuseEvent.entry_id == e.id)).scalars().all()
    out["reuse_events"] = [{"id": r.id, "kind": r.kind, "outcome": r.outcome,
                            "at": r.recorded_at.isoformat()} for r in reuses]
    return out


class SearchIn(BaseModel):
    q: str
    scope: str = "private"
    team_id: str | None = None
    limit: int = 20


@router.post("/entries/search")
def search(body: SearchIn, u=Depends(current_user), db: Session = Depends(get_db)):
    q = select(Entry)
    if body.scope == "private":
        if not body.team_id:
            raise HTTPException(400, "team_id required for private")
        require_role(db, body.team_id, u.id)
        q = q.where(Entry.team_id == body.team_id)
    else:
        q = q.where(Entry.scope == "global")
    like = f"%{body.q[:200]}%"
    q = q.where(or_(Entry.redacted_error_text.ilike(like),
                    Entry.signature_normalized.ilike(like),
                    Entry.title.ilike(like)))
    rows = db.execute(q.limit(body.limit)).scalars().all()
    return {"results": [_entry_view(e) for e in rows]}

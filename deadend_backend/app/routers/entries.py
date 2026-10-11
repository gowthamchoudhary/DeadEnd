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
        "project_id": e.project_id,
        "last_reuse_at": e.last_reuse_at.isoformat() if e.last_reuse_at else None,
        "created_at": e.created_at.isoformat(),
    }
    return out


def _observations(db: Session, entry_ids: list[str]) -> dict[str, dict]:
    """Real reuse-event counts per entry (kind=test excluded, same rule as
    the confidence scorer). Powers "n observations" in the dashboard."""
    out: dict[str, dict] = {}
    if not entry_ids:
        return out
    evs = db.execute(select(ReuseEvent).where(ReuseEvent.entry_id.in_(entry_ids))
                     ).scalars().all()
    for ev in evs:
        if ev.kind == "test":
            continue
        d = out.setdefault(ev.entry_id, {"observations": 0, "reuse_success": 0})
        d["observations"] += 1
        if ev.outcome == "success":
            d["reuse_success"] += 1
    return out


@router.get("/entries")
def list_entries(scope: str, team_id: str | None = None, page: int = 1,
                 per_page: int = 20, verified: bool | None = None,
                 project_id: str | None = None, seeded: bool | None = None,
                 min_conf: float | None = None, max_conf: float | None = None,
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
    if project_id:
        q = q.where(Entry.project_id == project_id)
    if seeded is not None:
        q = q.where(Entry.seeded == seeded)
    # base confidence = alpha / (alpha + beta), the same quantity the
    # dashboard shows (score multiplies in env-match + recency at read time)
    conf = Entry.alpha / (Entry.alpha + Entry.beta)
    if min_conf is not None:
        q = q.where(conf >= min_conf)
    if max_conf is not None:
        q = q.where(conf <= max_conf)
    rows = db.execute(q.order_by(Entry.created_at.desc())
                      .offset((max(1, page) - 1) * per_page).limit(per_page)).scalars().all()
    obs = _observations(db, [e.id for e in rows])
    views = []
    for e in rows:
        v = _entry_view(e)
        v.update({k: obs.get(e.id, {}).get(k, 0) for k in ("observations", "reuse_success")})
        views.append(v)
    return [{"page": page, "per_page": per_page, "entries": views}]


@router.get("/entries/{entry_id}")
def get_entry(entry_id: str, u=Depends(current_user), db: Session = Depends(get_db)):
    from ..confidence import score as confidence_score
    e = db.get(Entry, entry_id)
    if not e:
        raise HTTPException(404, "entry not found")
    if e.scope == "private":
        require_role(db, e.team_id, u.id)
    out = _entry_view(e)
    reuses = db.execute(select(ReuseEvent).where(ReuseEvent.entry_id == e.id)).scalars().all()
    out["reuse_events"] = [{"id": r.id, "kind": r.kind, "outcome": r.outcome,
                            "at": r.recorded_at.isoformat()} for r in reuses]
    ev_dicts = [{"kind": r.kind, "outcome": r.outcome,
                 "env_match_weight": r.env_match_weight,
                 "env_fingerprint": r.env_fingerprint} for r in reuses]
    # canonical scorer (same function as scripts/confidence.py spec):
    # score = base * env_match * recency_decay, observation count surfaced
    out["confidence"] = confidence_score(e.fix, ev_dicts, None, e.env_fingerprint,
                                         e.last_reuse_at)
    out["observations"] = sum(1 for r in reuses if r.kind != "test")
    out["reuse_success"] = sum(1 for r in reuses if r.kind != "test" and r.outcome == "success")
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

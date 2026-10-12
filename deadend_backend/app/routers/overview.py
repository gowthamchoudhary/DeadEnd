"""/auth/tokens — list my API tokens (never the secret), for the
settings/extension UI (revoke stays at DELETE /auth/tokens/{id}).

/me/overview — counts for the dashboard:
  entries by scope, verified count, runs, success rate, total tokens,
  time saved estimate computed ONLY from real reuse events tied to runs
  (sum of the run durations of successful reuse events), null when no
  data. Repeated failures top 5, recent runs.
"""
from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (ApiToken, Entry, ReuseEvent, Run, TeamMember, User)
from ..security import current_user

router = APIRouter(tags=["overview"])


@router.get("/auth/tokens")
def list_tokens(u: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(ApiToken).where(ApiToken.user_id == u.id)
                      .order_by(ApiToken.created_at.desc())).scalars().all()
    return [{"token_id": t.id, "label": t.label,
             "created_at": t.created_at.isoformat(),
             "revoked": t.revoked_at is not None,
             "last_used_at": t.last_used_at.isoformat() if t.last_used_at else None,
             "scopes": t.scopes}
            for t in rows]


@router.get("/me/overview")
def overview(u: User = Depends(current_user), db: Session = Depends(get_db)):
    memberships = db.execute(select(TeamMember).where(TeamMember.user_id == u.id)
                             ).scalars().all()
    team_ids = [m.team_id for m in memberships]
    out = {"teams": [{"team_id": m.team_id, "role": m.role} for m in memberships],
           "entries": None, "runs": None}
    out["tokens"] = db.execute(
        select(ApiToken.id).where(ApiToken.user_id == u.id,
                                  ApiToken.revoked_at.is_(None)).limit(1)
    ).first() is not None
    if not team_ids:
        return out

    entries = db.execute(select(Entry).where(Entry.team_id.in_(team_ids))
                         .order_by(Entry.created_at.desc())).scalars().all()
    runs = db.execute(select(Run).where(Run.team_id.in_(team_ids))
                      .order_by(Run.started_at.desc())).scalars().all()
    ids = [e.id for e in entries]
    reuses = db.execute(select(ReuseEvent).where(ReuseEvent.entry_id.in_(ids))
                        ).scalars().all() if ids else []
    run_by_id = {r.id: r for r in runs}

    n_runs = len(runs)
    ok_runs = sum(1 for r in runs if r.status == "success")
    total_tokens = sum((r.tokens_in or 0) + (r.tokens_out or 0) for r in runs)

    # time saved ONLY from real reuse events on runs we know the duration of
    saved = 0.0
    for ev in reuses:
        if ev.kind != "real" or ev.outcome != "success":
            continue
        r = run_by_id.get(ev.run_id) if ev.run_id else None
        if r and r.duration:
            saved += r.duration
    out["entries"] = {
        "private": sum(1 for e in entries if e.scope == "private"),
        "global_reused": sum(1 for e in entries if e.scope == "global"),
        "verified": sum(1 for e in entries if e.verified),
        "source": [t for t in team_ids],
    }
    out["runs"] = {
        "total": n_runs,
        "success_rate": round(ok_runs / n_runs, 4) if n_runs else None,
        "total_tokens": total_tokens if n_runs else None,
        "time_saved_seconds": round(saved, 1) if saved > 0 else None,
        "note": "time saved estimated ONLY from real reuse events with known run duration; null when no data",
    }
    # repeated failures top 5 (by private entries)
    sig_counts = Counter(
        e.signature_hash for e in entries if e.scope == "private" and e.signature_hash)
    repeated = []
    for sig, cnt in sig_counts.most_common(5):
        if cnt < 2:
            break
        sample = next(e for e in entries if e.signature_hash == sig)
        repeated.append({"signature_hash": sig, "count": cnt,
                         "title": sample.title or sample.signature_normalized[:120]})
    out["repeated_failures"] = repeated
    out["recent_runs"] = [{"run_id": r.id, "task": r.task[:120], "agent": r.agent,
                           "status": r.status,
                           "started_at": r.started_at.isoformat()}
                          for r in runs[:8]]
    return out

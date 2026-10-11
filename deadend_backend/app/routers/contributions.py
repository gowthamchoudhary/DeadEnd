"""Sharing queue + team sharing policy.

GET  /contributions?team_id=  — promotions with status
POST /contributions/{id}/reject
PATCH /teams/{team_id}/settings {default_share: off|team|global-after-approval}
GET   /teams/{team_id}/settings
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..models import Contribution, TeamSettings
from ..security import RATE, current_user, require_role

router = APIRouter(tags=["contributions", "teams"])


@router.get("/contributions")
def list_contributions(team_id: str, status: str | None = None,
                       u=Depends(current_user), db: Session = Depends(get_db)):
    require_role(db, team_id, u.id)
    q = select(Contribution).where(Contribution.team_id == team_id)
    if status:
        if status not in ("drafting", "awaiting_approval", "approved", "rejected", "published"):
            raise HTTPException(400, "bad status filter")
        q = q.where(Contribution.status == status)
    rows = db.execute(q.order_by(Contribution.created_at.desc()).limit(200)).scalars().all()
    return [{"contribution_id": c.id, "entry_id": c.entry_id,
             "status": c.status,
             "user_id": c.user_id,
             "diff_summary": {
                 k: (str(v)[:160] if v is not None else "")
                 for k, v in (c.diff or {}).items()
             } if c.diff else {},
             "created_at": c.created_at.isoformat(),
             "decided_at": c.decided_at.isoformat() if c.decided_at else None}
            for c in rows]


@router.post("/contributions/{contribution_id}/reject")
def reject(contribution_id: str, u=Depends(current_user),
           db: Session = Depends(get_db)):
    c = db.get(Contribution, contribution_id)
    if not c:
        raise HTTPException(404, "contribution not found")
    # reject: submitter or team admin/owner
    role = require_role(db, c.team_id, u.id, ("owner", "admin", "member"))
    if u.id != c.user_id and role not in ("owner", "admin"):
        raise HTTPException(403, "only the submitter or a team admin can reject")
    if c.status not in ("awaiting_approval", "drafting"):
        raise HTTPException(400, f"cannot reject from status {c.status}")
    c.status, c.decided_at, c.decided_by = "rejected", __import__("datetime").datetime.now(
        __import__("datetime").timezone.utc), u.id
    audit(db, u.id, "contribution_rejected", target=c.id, detail={"team": c.team_id})
    db.commit()
    return {"contribution_id": c.id, "status": "rejected"}


# ------------------------------------------------------------ team settings
class SettingsIn(BaseModel):
    default_share: str = Field(pattern="^(off|team|global-after-approval)$")


@router.get("/teams/{team_id}/settings")
def get_settings_route(team_id: str, u=Depends(current_user),
                       db: Session = Depends(get_db)):
    require_role(db, team_id, u.id)
    s = db.get(TeamSettings, team_id)
    return {"team_id": team_id,
            "default_share": s.default_share if s else "off"}


@router.patch("/teams/{team_id}/settings")
def patch_settings(team_id: str, body: SettingsIn, u=Depends(current_user),
                   db: Session = Depends(get_db)):
    if not RATE.hit(f"settings:{u.id}", 10):
        raise HTTPException(429, "rate limit")
    require_role(db, team_id, u.id, ("owner", "admin"))
    s = db.get(TeamSettings, team_id)
    if not s:
        s = TeamSettings(team_id=team_id, default_share=body.default_share)
        db.add(s)
    else:
        s.default_share = body.default_share
    audit(db, u.id, "team_settings_updated", target=team_id,
          detail={"default_share": body.default_share})
    db.commit()
    return {"team_id": team_id, "default_share": s.default_share}

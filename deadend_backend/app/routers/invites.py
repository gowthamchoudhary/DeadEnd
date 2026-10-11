"""Pending team invites: the existing POST /teams/{id}/invite still adds a
member directly for existing users; this router adds explicit invite
records so a GitHub user can accept or decline (GET /invites,
POST /invites/{id}/accept, POST /invites/{id}/decline)."""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..models import TeamMember, User
from ..security import RATE, current_user

router = APIRouter(tags=["invites"])


def ensure_models(db: Session):
    """imports here to avoid circulars"""
    from ..models import Invite  # noqa: F401


class InviteIn(BaseModel):
    team_id: str
    github_login: str
    role: str = "member"


@router.post("/invites")
def create_invite(body: InviteIn, u=Depends(current_user), db: Session = Depends(get_db)):
    from ..models import Invite
    from ..security import require_role
    if not RATE.hit(f"invites:{u.id}", 10):
        raise HTTPException(429, "invite rate limit")
    require_role(db, body.team_id, u.id, ("owner", "admin"))
    target = db.execute(select(User).where(User.login == body.github_login)).scalar_one_or_none()
    if not target:
        raise HTTPException(404, f"github user {body.github_login} not on DeadEnd yet")
    if db.execute(select(TeamMember).where(TeamMember.team_id == body.team_id,
                                           TeamMember.user_id == target.id)).scalar_one_or_none():
        raise HTTPException(409, "already a member")
    if db.execute(select(Invite).where(Invite.team_id == body.team_id,
                                       Invite.invitee_id == target.id,
                                       Invite.status == "pending")).scalar_one_or_none():
        raise HTTPException(409, "invite already pending")
    inv = Invite(team_id=body.team_id, inviter_id=u.id, invitee_id=target.id,
                 role=body.role, status="pending")
    db.add(inv)
    audit(db, u.id, "invite_created", target=inv.id, detail={"team": body.team_id})
    db.commit()
    return {"invite_id": inv.id, "status": inv.status}


def _my_pending(db: Session, user_id: str):
    from ..models import Invite
    return db.execute(select(Invite).where(Invite.invitee_id == user_id,
                                           Invite.status == "pending")
                      .order_by(Invite.created_at.desc())).scalars().all()


@router.get("/invites")
def my_invites(u=Depends(current_user), db: Session = Depends(get_db)):
    from ..models import Team
    out = []
    for inv in _my_pending(db, u.id):
        team = db.get(Team, inv.team_id)
        out.append({"invite_id": inv.id, "team_id": inv.team_id,
                    "team_name": team.name if team else "",
                    "role": inv.role,
                    "created_at": inv.created_at.isoformat()})
    return out


@router.post("/invites/{invite_id}/accept")
def accept(invite_id: str, u=Depends(current_user), db: Session = Depends(get_db)):
    from ..models import Invite
    if not RATE.hit(f"invites:{u.id}", 20):
        raise HTTPException(429, "rate limit")
    inv = db.get(Invite, invite_id)
    if not inv or inv.invitee_id != u.id or inv.status != "pending":
        raise HTTPException(404, "pending invite not found")
    inv.status, inv.decided_at = "accepted", dt.datetime.now(dt.timezone.utc)
    db.add(TeamMember(team_id=inv.team_id, user_id=u.id, role=inv.role))
    audit(db, u.id, "invite_accepted", target=inv.id)
    db.commit()
    return {"invite_id": inv.id, "status": "accepted", "team_id": inv.team_id}


@router.post("/invites/{invite_id}/decline")
def decline(invite_id: str, u=Depends(current_user), db: Session = Depends(get_db)):
    from ..models import Invite
    inv = db.get(Invite, invite_id)
    if not inv or inv.invitee_id != u.id or inv.status != "pending":
        raise HTTPException(404, "pending invite not found")
    inv.status, inv.decided_at = "declined", dt.datetime.now(dt.timezone.utc)
    audit(db, u.id, "invite_declined", target=inv.id)
    db.commit()
    return {"invite_id": inv.id, "status": "declined"}

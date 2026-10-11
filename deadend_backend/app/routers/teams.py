"""Teams: create, invite by GitHub login, members, role management."""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..audit import audit
from ..config import get_settings
from ..db import get_db
from ..models import Invite, Team, TeamMember, User
from ..security import current_user, require_role

S = get_settings()
router = APIRouter(prefix="/teams", tags=["teams"])


class TeamIn(BaseModel):
    name: str


class InviteIn(BaseModel):
    github_login: str
    role: str = "member"


class RoleIn(BaseModel):
    user_id: str
    role: str


@router.get("")
def my_teams(u=Depends(current_user), db: Session = Depends(get_db)):
    """Teams I belong to, with the NAME (the dashboard switcher needs it).
    /auth/me and /me/overview only carry team_id + role."""
    rows = db.execute(select(TeamMember).where(TeamMember.user_id == u.id)
                      ).scalars().all()
    out = []
    for m in rows:
        t = db.get(Team, m.team_id)
        if not t:
            continue
        n = db.execute(select(func.count()).select_from(TeamMember)
                       .where(TeamMember.team_id == t.id)).scalar_one()
        out.append({"team_id": t.id, "name": t.name, "role": m.role,
                    "members": n, "created_at": t.created_at.isoformat()})
    return out


class RenameIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)


@router.patch("/{team_id}")
def rename_team(team_id: str, body: RenameIn, u=Depends(current_user),
                db: Session = Depends(get_db)):
    """Rename a team (owner/admin). Names are globally unique."""
    require_role(db, team_id, u.id, ("owner", "admin"))
    t = db.get(Team, team_id)
    if not t:
        raise HTTPException(404, "team not found")
    clash = db.execute(select(Team).where(Team.name == body.name,
                                          Team.id != team_id)).scalar_one_or_none()
    if clash:
        raise HTTPException(409, "team name already taken")
    old = t.name
    t.name = body.name
    audit(db, u.id, "team_renamed", target=team_id,
          detail={"from": old, "to": body.name})
    db.commit()
    return {"team_id": t.id, "name": t.name}


@router.get("/{team_id}/invites")
def team_invites(team_id: str, u=Depends(current_user), db: Session = Depends(get_db)):
    """Pending invites SENT to this team (owner/admin). GET /invites only
    returns invites addressed to the caller."""
    require_role(db, team_id, u.id, ("owner", "admin"))
    rows = db.execute(select(Invite).where(Invite.team_id == team_id,
                                           Invite.status == "pending")
                      .order_by(Invite.created_at.desc())).scalars().all()
    out = []
    for inv in rows:
        usr = db.get(User, inv.invitee_id)
        inviter = db.get(User, inv.inviter_id)
        out.append({"invite_id": inv.id,
                    "github_login": usr.login if usr else "",
                    "role": inv.role,
                    "invited_by": inviter.login if inviter else None,
                    "created_at": inv.created_at.isoformat()})
    return out


@router.post("")
def create_team(body: TeamIn, u=Depends(current_user), db: Session = Depends(get_db)):
    t = Team(name=body.name, created_by=u.id)
    db.add(t)
    db.flush()
    db.add(TeamMember(team_id=t.id, user_id=u.id, role="owner"))
    db.commit()
    return {"team_id": t.id, "name": t.name}


@router.post("/{team_id}/invite")
def invite(team_id: str, body: InviteIn, u=Depends(current_user),
           db: Session = Depends(get_db)):
    require_role(db, team_id, u.id, ("owner", "admin"))
    target = db.execute(select(User).where(User.login == body.github_login)).scalar_one_or_none()
    if not target:
        with httpx.Client(timeout=10) as c:
            r = c.get(f"https://api.github.com/users/{body.github_login}")
        if r.status_code != 200:
            raise HTTPException(404, f"github user {body.github_login} not found")
        gh = r.json()
        target = User(github_id=str(gh["id"]), login=gh["login"], name=gh.get("name"),
                      avatar_url=gh.get("avatar_url"))
        db.add(target)
        db.flush()
    if db.execute(select(TeamMember).where(TeamMember.team_id == team_id,
                                           TeamMember.user_id == target.id)).scalar_one_or_none():
        raise HTTPException(409, "already a member")
    db.add(TeamMember(team_id=team_id, user_id=target.id, role=body.role))
    db.commit()
    return {"invited": target.login, "user_id": target.id, "role": body.role}


@router.get("/{team_id}/members")
def members(team_id: str, u=Depends(current_user), db: Session = Depends(get_db)):
    require_role(db, team_id, u.id)
    rows = db.execute(select(TeamMember).where(TeamMember.team_id == team_id)).scalars().all()
    out = []
    for m in rows:
        usr = db.get(User, m.user_id)
        out.append({"user_id": m.user_id, "login": usr.login, "role": m.role})
    return out


@router.post("/{team_id}/role")
def set_role(team_id: str, body: RoleIn, u=Depends(current_user),
             db: Session = Depends(get_db)):
    require_role(db, team_id, u.id, ("owner", "admin"))
    m = db.execute(select(TeamMember).where(TeamMember.team_id == team_id,
                                            TeamMember.user_id == body.user_id)).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "not a member")
    if m.user_id == u.id and m.role == "owner" and body.role != "owner":
        raise HTTPException(400, "cannot demote the last owner")
    m.role = body.role
    db.commit()
    return {"user_id": body.user_id, "role": body.role}

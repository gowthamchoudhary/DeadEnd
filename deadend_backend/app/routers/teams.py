"""Teams: create, invite by GitHub login, members, role management."""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Team, TeamMember, User
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

"""Projects: repos a team works on, created on first use by name.

POST /projects {team_id, name, repo_url?}  (member; idempotent per name)
GET  /projects?team_id=                    (member; newest first)
Helper get_or_create_project() is used by /runs, /runs/{id}/summary and
/ingest when a project name (the git repo name) is supplied.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..models import Project
from ..security import RATE, current_user, require_role

router = APIRouter(tags=["projects"])


def get_or_create_project(db: Session, team_id: str, name: str,
                          repo_url: str | None = None) -> Project:
    """Idempotent per (team_id, name). Used by runs/ingest."""
    name = (name or "").strip()[:128]
    if not name:
        raise HTTPException(400, "project name required")
    p = db.execute(select(Project).where(Project.team_id == team_id,
                                         Project.name == name)).scalar_one_or_none()
    if p:
        if repo_url and not p.repo_url:
            p.repo_url = repo_url
            db.commit()
        return p
    p = Project(team_id=team_id, name=name, repo_url=repo_url)
    db.add(p)
    db.flush()
    return p


class ProjectIn(BaseModel):
    team_id: str
    name: str = Field(max_length=128)
    repo_url: str | None = Field(default=None, max_length=2000)


@router.post("/projects")
def create_project(body: ProjectIn, u=Depends(current_user),
                   db: Session = Depends(get_db)):
    if not RATE.hit(f"projects:{u.id}", 30):
        raise HTTPException(429, "rate limit")
    require_role(db, body.team_id, u.id)
    existing = db.execute(select(Project).where(Project.team_id == body.team_id,
                                                Project.name == body.name.strip())
                          ).scalar_one_or_none()
    if existing:
        return {"project_id": existing.id, "name": existing.name,
                "repo_url": existing.repo_url, "created": False}
    p = get_or_create_project(db, body.team_id, body.name, body.repo_url)
    audit(db, u.id, "project_created", target=p.id, detail={"team": body.team_id})
    db.commit()
    return {"project_id": p.id, "name": p.name, "repo_url": p.repo_url, "created": True}


@router.get("/projects")
def list_projects(team_id: str, u=Depends(current_user), db: Session = Depends(get_db)):
    require_role(db, team_id, u.id)
    rows = db.execute(select(Project).where(Project.team_id == team_id)
                      .order_by(Project.created_at.desc()).limit(200)).scalars().all()
    return [{"project_id": p.id, "name": p.name, "repo_url": p.repo_url,
             "created_at": p.created_at.isoformat()} for p in rows]

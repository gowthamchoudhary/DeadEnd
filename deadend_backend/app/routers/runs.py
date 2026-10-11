"""Runs: create, append events, finish, list; SSE stream for the live panel."""
import asyncio
import datetime as dt
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Run, RunEvent, TeamMember
from ..security import current_user

router = APIRouter(prefix="/runs", tags=["runs"])


class RunIn(BaseModel):
    team_id: str
    task: str = Field(max_length=4000)
    repo_url: str | None = None
    agent: str = "claude-code"
    project: str | None = Field(default=None, max_length=128,
                                description="git repo name; project created on first use")


class EventIn(BaseModel):
    phase: str
    payload: dict = Field(default_factory=dict)


class RunSummaryIn(BaseModel):
    """Agent telemetry reported by deadend-runner after an attempt."""
    agent: str
    agent_version: str | None = None
    model: str | None = None
    tokens_in: int | None = Field(default=None, ge=0)
    tokens_out: int | None = Field(default=None, ge=0)
    duration: float | None = Field(default=None, ge=0)
    context_used: bool = False


@router.post("")
def create_run(body: RunIn, u=Depends(current_user), db: Session = Depends(get_db)):
    require_team(db, body.team_id, u.id)
    project_id = None
    if body.project:
        from .projects import get_or_create_project
        project_id = get_or_create_project(db, body.team_id, body.project,
                                           body.repo_url).id
    r = Run(team_id=body.team_id, user_id=u.id, task=body.task,
            repo_url=body.repo_url, agent=body.agent, project_id=project_id)
    db.add(r)
    db.commit()
    return {"run_id": r.id}


@router.post("/{run_id}/events")
def append_event(run_id: str, body: EventIn, u=Depends(current_user),
                 db: Session = Depends(get_db)):
    r = _owned_run(db, run_id, u.id)
    seq = db.execute(select(RunEvent).where(RunEvent.run_id == run_id)
                     .order_by(RunEvent.seq.desc()).limit(1)).scalar_one_or_none()
    n = (seq.seq + 1) if seq else 0
    db.add(RunEvent(run_id=run_id, seq=n, phase=body.phase, payload=body.payload))
    db.commit()
    _notify(run_id)
    return {"seq": n}


@router.post("/{run_id}/finish")
def finish_run(run_id: str, status: str, u=Depends(current_user),
               db: Session = Depends(get_db)):
    r = _owned_run(db, run_id, u.id)
    if status not in ("success", "failure"):
        raise HTTPException(400, "status must be success|failure")
    r.status = status
    r.finished_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    _notify(run_id)
    return {"run_id": run_id, "status": status}


@router.post("/{run_id}/summary")
def summarize_run(run_id: str, body: RunSummaryIn, u=Depends(current_user),
                  db: Session = Depends(get_db)):
    """Record agent/model/tokens/duration + whether context was applied.
    Powers GET /stats/agents comparisons (with vs without context)."""
    r = _owned_run(db, run_id, u.id)
    r.agent = body.agent
    r.agent_version = body.agent_version
    r.model = body.model
    r.tokens_in = body.tokens_in
    r.tokens_out = body.tokens_out
    r.duration = body.duration
    cp = dict(r.context_pack or {})
    cp["context_used"] = body.context_used
    r.context_pack = cp
    db.commit()
    return {"run_id": run_id, "agent": r.agent, "model": r.model}


@router.get("")
def list_runs(team_id: str, u=Depends(current_user), db: Session = Depends(get_db)):
    require_team(db, team_id, u.id)
    rows = db.execute(select(Run).where(Run.team_id == team_id)
                      .order_by(Run.started_at.desc()).limit(100)).scalars().all()
    return [{"run_id": r.id, "task": r.task[:200], "agent": r.agent,
             "agent_version": r.agent_version, "model": r.model,
             "tokens_in": r.tokens_in, "tokens_out": r.tokens_out,
             "duration": r.duration, "project_id": r.project_id,
             "status": r.status, "started_at": r.started_at.isoformat(),
             "finished_at": r.finished_at.isoformat() if r.finished_at else None}
            for r in rows]


@router.get("/{run_id}/stream")
async def stream(run_id: str, request=None):
    """SSE: polls the event table; pushes new events as they land."""
    async def gen():
        last = -1
        while True:
            db = get_db_first()
            try:
                rows = db.execute(select(RunEvent).where(RunEvent.run_id == run_id)
                                  .order_by(RunEvent.seq)).scalars().all()
                for ev in rows:
                    if ev.seq > last:
                        last = ev.seq
                        yield f"data: {json.dumps({'seq': ev.seq, 'phase': ev.phase, 'payload': ev.payload})}\n\n"
                run = db.get(Run, run_id)
                if run and run.finished_at and run.status != "running":
                    yield f"event: done\ndata: {json.dumps({'status': run.status})}\n\n"
                    return
            finally:
                db.close()
            await asyncio.sleep(1)
    return StreamingResponse(gen(), media_type="text/event-stream")


# helpers ----------------------------------------------------------------
_NOTIFY: dict[str, list] = {}


def _notify(run_id: str):
    for q in _NOTIFY.get(run_id, []):
        q.append(1)


def _owned_run(db: Session, run_id: str, user_id: str) -> Run:
    r = db.get(Run, run_id)
    if not r:
        raise HTTPException(404, "run not found")
    if r.user_id != user_id:
        raise HTTPException(403, "not your run")
    return r


def require_team(db: Session, team_id: str, user_id: str):
    if not db.execute(select(TeamMember).where(TeamMember.team_id == team_id,
                                               TeamMember.user_id == user_id)).scalar_one_or_none():
        raise HTTPException(403, "not a member")


def get_db_first():
    from ..db import sessionmaker_tls
    return sessionmaker_tls()()

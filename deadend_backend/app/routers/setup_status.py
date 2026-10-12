"""GET /me/setup-status — facts the VS Code extension's setup checklist
shows. Everything here is read from real data:
  tokens   — active API token count
  teams    — the user's memberships (id, name, role)
  neatlogs — whether ANY of the user's runs recorded a neatlogs trace id
             (run_events record phase, payload.neatlogs_trace_id)
  entire   — whether ANY of the user's runs recorded an Entire checkpoint
             id (run_events record phase, payload.entire_checkpoint_id)
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ApiToken, Run, RunEvent, Team, TeamMember
from ..security import current_user
from ..config import get_settings

router = APIRouter(tags=["setup"])


class SetupStatus(BaseModel):
    tokens_count: int
    teams: list
    neatlogs_recorded: bool | None
    neatlogs_configured: bool
    entire_recorded: bool | None


def _scan_record_events(db: Session, user_id: str,
                        key: str) -> bool | None:
    """True when a record phase event of the user's runs carries the key.
    None when the user has no record events yet (never tried)."""
    rowids = db.execute(
        select(Run.id).where(Run.user_id == user_id)).scalars().all()
    if not rowids:
        return None
    evs = db.execute(select(RunEvent).where(RunEvent.run_id.in_(rowids),
                                            RunEvent.phase == "record")
                     ).scalars().all()
    return any((e.payload or {}).get(key) for e in evs) or None


@router.get("/me/setup-status")
def setup_status(u=Depends(current_user), db: Session = Depends(get_db)):
    tokens = db.execute(
        select(ApiToken).where(ApiToken.user_id == u.id,
                               ApiToken.revoked_at.is_(None))
    ).scalars().all()
    members = db.execute(
        select(TeamMember).where(TeamMember.user_id == u.id)).scalars().all()
    teams = []
    for m in members:
        t = db.get(Team, m.team_id)
        if t:
            teams.append({"team_id": m.team_id, "name": t.name,
                          "role": m.role})
    return {
        "tokens_count": len(tokens),
        "teams": teams,
        "neatlogs_recorded": _scan_record_events(db, u.id,
                                                 "neatlogs_trace_id"),
        "neatlogs_configured": bool(get_settings().neatlogs_api_key),
        "entire_recorded": _scan_record_events(db, u.id,
                                               "entire_checkpoint_id"),
    }
